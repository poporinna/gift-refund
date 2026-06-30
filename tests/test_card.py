"""
CardLedger — gift-card reconciliation behaviour.

The reconstructed (loaded, remaining) pair sets the card state and the refund.
Refunds are all-or-nothing: a pool that cannot cover the drained amount reverts
rather than paying part of it.
"""

import json
from pathlib import Path

LEDGER = str(Path(__file__).resolve().parents[1] / "backend" / "gift-refund.py")

HISTORY = ("Loaded 5000 cents on issue, then three redemptions at the gateway, "
           "with the running balance printed after each spend")


def balance(loaded, remaining, debits=0):
    return json.dumps({
        "loaded_units": loaded,
        "remaining_units": remaining,
        "debit_count": debits,
        "rationale": "the ledger arithmetic and the gateway log agree on the balance",
    })


def fund(vm, ledger, amount, funder):
    vm.sender = funder
    vm.value = amount
    ledger.fund_pool()
    vm.value = 0


def enroll_and_reconcile(vm, ledger, holder, loaded, remaining, debits=0):
    vm.sender = holder
    ledger.enroll_card("Gift card #4417", HISTORY)
    vm.mock_llm(r"GIFT CARD", balance(loaded, remaining, debits))
    ledger.reconcile_balance(0)


def test_an_untouched_card_owes_nothing(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 4000, direct_bob)
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 5000, 5000)
    ledger.rule(0)
    assert ledger.get_state(0) == "VALID"

    ledger.refund_or_close(0)
    assert ledger.get_phase(0) == "CLOSED"
    assert int(ledger.get_card(0).refund_paid) == 0
    assert ledger.get_pool_balance() == "4000||0"  # pool untouched


def test_a_partly_drained_card_is_refunded_the_difference(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 4000, direct_bob)
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 5000, 2000, debits=3)
    ledger.rule(0)
    assert ledger.get_state(0) == "PARTIAL"

    ledger.refund_or_close(0)  # drained = 3000
    assert int(ledger.get_card(0).refund_paid) == 3000
    assert ledger.get_pool_balance() == "1000||3000"


def test_a_drained_card_is_refunded_in_full(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 6000, direct_bob)
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 5000, 0, debits=8)
    ledger.rule(0)
    assert ledger.get_state(0) == "EMPTY"

    ledger.refund_or_close(0)
    assert int(ledger.get_card(0).refund_paid) == 5000
    assert ledger.get_stats().split("||")[-1] == "1"  # empty tally


def test_a_short_pool_refuses_a_partial_refund(direct_vm, deploy, direct_alice, direct_bob):
    ledger = deploy(LEDGER)
    fund(direct_vm, ledger, 1000, direct_bob)  # less than the 4000 drained
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 5000, 1000)
    ledger.rule(0)

    with direct_vm.expect_revert("cannot cover"):
        ledger.refund_or_close(0)
    # Nothing moved and the card stays ruled, awaiting a funded pool.
    assert ledger.get_pool_balance() == "1000||0"
    assert ledger.get_phase(0) == "RULED"


def test_an_overstated_balance_is_clamped(direct_vm, deploy, direct_alice):
    ledger = deploy(LEDGER)
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 3000, 9999)  # remaining > loaded
    ledger.rule(0)
    assert ledger.get_state(0) == "VALID"
    assert ledger.get_balance(0) == "loaded=3000|remaining=3000|drained=0|debits=0"


def test_enrolment_needs_a_label_and_real_history(direct_vm, deploy, direct_alice):
    ledger = deploy(LEDGER)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("card label is required"):
        ledger.enroll_card("", HISTORY)
    with direct_vm.expect_revert("too short"):
        ledger.enroll_card("Gift card #4417", "spent")


def test_validators_agree_on_the_state(direct_vm, deploy, direct_alice):
    ledger = deploy(LEDGER)
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 5000, 2000, debits=3)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"GIFT CARD", balance(5000, 5000))  # now reads as untouched
    assert direct_vm.run_validator() is False


def test_the_figures_are_internally_consistent(direct_vm, deploy, direct_alice):
    ledger = deploy(LEDGER)
    enroll_and_reconcile(direct_vm, ledger, direct_alice, 5000, 1500, debits=4)
    assert ledger.check_integrity(0) == "ok"
    assert ledger.get_balance(0) == "loaded=5000|remaining=1500|drained=3500|debits=4"
