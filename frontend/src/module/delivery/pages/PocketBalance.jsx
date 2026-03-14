import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  fetchDeliveryWallet,
  calculateDeliveryBalances,
  calculatePeriodEarnings
} from
  "../utils/deliveryWalletState";
import { formatCurrency } from "../../restaurant/utils/currency";
import { deliveryAPI } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from
  "@/components/ui/dialog";

export default function PocketBalancePage() {
  const navigate = useNavigate();
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    totalWithdrawn: 0,
    totalEarned: 0,
    transactions: [],
    joiningBonusClaimed: false
  });
  const [walletLoading, setWalletLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [payoutProfile, setPayoutProfile] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  // Fetch wallet data from API (cashInHand = Cash collected from backend)
  const fetchWalletData = async () => {
    try {
      setWalletLoading(true);
      const walletData = await fetchDeliveryWallet();
      setWalletState(walletData);
    } catch (error) {
      console.error('Error fetching wallet data:', error);
      setWalletState({
        totalBalance: 0,
        cashInHand: 0,
        totalWithdrawn: 0,
        totalEarned: 0,
        transactions: [],
        joiningBonusClaimed: false
      });
    } finally {
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();

    const handleWalletUpdate = () => {
      fetchWalletData();
    };

    window.addEventListener('deliveryWalletStateUpdated', handleWalletUpdate);
    window.addEventListener('storage', handleWalletUpdate);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchWalletData();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Refetch periodically when visible so admin approve/reject reflects in pocket balance
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchWalletData();
    }, 20000);

    return () => {
      window.removeEventListener('deliveryWalletStateUpdated', handleWalletUpdate);
      window.removeEventListener('storage', handleWalletUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, []);

  const balances = calculateDeliveryBalances(walletState);

  // Calculate weekly earnings for the current week (excludes bonus)
  const weeklyEarnings = calculatePeriodEarnings(walletState, 'week');

  // Calculate total bonus amount from all bonus transactions
  const totalBonus = walletState?.transactions?.
    filter((t) => t.type === 'bonus' && t.status === 'Completed').
    reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

  // Tips + earnings breakdown (avoid double-counting tip if payment already includes it)
  const tipByOrder = new Map();
  const tipTransactions = walletState?.transactions?.
    filter((t) => t.type === 'tip' && t.status === 'Completed') || [];
  tipTransactions.forEach((t) => {
    const orderId = t.orderId ? String(t.orderId) : '';
    if (!orderId) return;
    tipByOrder.set(orderId, (tipByOrder.get(orderId) || 0) + (t.amount || 0));
  });
  const paymentTransactions = walletState?.transactions?.
    filter((t) => t.type === 'payment' && t.status === 'Completed') || [];
  const tipFromPayments = paymentTransactions.reduce((sum, t) => {
    const orderId = t.orderId ? String(t.orderId) : '';
    if (!orderId || tipByOrder.has(orderId)) return sum;
    const tipFromPayment = Number(t?.metadata?.tip ?? t?.metadata?.tipAmount ?? 0) || 0;
    return sum + tipFromPayment;
  }, 0);
  const totalTips =
    (tipTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) || 0) +
    (tipFromPayments || 0);

  // Calculate total withdrawn (needed for pocket balance calculation)
  const totalWithdrawn = balances.totalWithdrawn || 0;

  const cashInHand = Number(walletState?.cashInHand ?? balances.cashInHand ?? 0);
  const hasPocketBalance = walletState?.pocketBalance !== undefined && walletState?.pocketBalance !== null;

  // Pocket balance = total balance (includes bonus + tips + earnings)
  // Formula: Pocket Balance = Earnings + Bonus + Tips - Withdrawals
  // Use walletState.pocketBalance if available, otherwise calculate from totalBalance
  let pocketBalance = hasPocketBalance ?
    Number(walletState.pocketBalance) || 0 :
    (Number(walletState?.totalBalance ?? balances.totalBalance ?? 0) - cashInHand);

  // Calculate total earnings (all-time, not just weekly) - exclude tips if they are separate transactions
  const totalEarnings = paymentTransactions.
    reduce((sum, t) => {
      const amount = Number(t.amount) || 0;
      const orderId = t.orderId ? String(t.orderId) : '';
      const tipFromTxn = orderId && tipByOrder.has(orderId) ? (tipByOrder.get(orderId) || 0) : 0;
      const tipFromPayment = Number(t?.metadata?.tip ?? t?.metadata?.tipAmount ?? 0) || 0;
      const tipForOrder = tipFromTxn > 0 ? tipFromTxn : tipFromPayment;
      return sum + Math.max(0, amount - tipForOrder);
    }, 0) || 0;

  // IMPORTANT: Ensure pocket balance includes bonus and tips
  // If backend totalBalance is 0 but we have bonus/tips/earnings, calculate it manually
  // This ensures bonus, tips, and earnings are always reflected in pocket balance and withdrawable amount
  if (!hasPocketBalance) {
    if (pocketBalance === 0 && (totalBonus > 0 || totalTips > 0 || totalEarnings > 0)) {
      // If totalBalance is 0 but we have earnings/bonus/tips, pocket balance = earnings + bonus + tips
      pocketBalance = totalEarnings + totalBonus + totalTips - totalWithdrawn - cashInHand;
    } else if (pocketBalance > 0 && (totalBonus > 0 || totalTips > 0 || totalEarnings > 0)) {
      // Verify pocket balance includes bonus, tips, and all earnings
      // Calculate expected: Total Earnings (all-time) + Bonus + Tips - Withdrawals
      const expectedBalance = totalEarnings + totalBonus + totalTips - totalWithdrawn - cashInHand;
      // Use the higher value to ensure bonus, tips, and all earnings are included
      if (expectedBalance > pocketBalance) {
        pocketBalance = expectedBalance;
      }
    }
  }

  // Calculate cash collected (cash in hand)
  const cashCollected = cashInHand;

  // Deductions = actual deductions only (fees, penalties). Pending withdrawal is NOT a deduction.
  const deductions = 0;

  // Amount withdrawn = approved + pending (requested) withdrawals. Withdraw ki hui amount yahin dikhegi.
  const amountWithdrawnDisplay = (balances.totalWithdrawn || 0) + (balances.pendingWithdrawals || 0);

  // Withdrawal limit from admin (min amount above which withdrawal is allowed)
  const withdrawalLimit = Number(walletState?.deliveryWithdrawalLimit) || 100;

  const payoutDocs = payoutProfile?.documents || {};
  const payoutBank = payoutDocs.bankDetails;
  const payoutUpiId = payoutDocs.upiId;
  const payoutQr = payoutDocs.qrCode;
  const hasPayoutBank =
    payoutBank?.accountHolderName?.trim() &&
    payoutBank?.accountNumber?.trim() &&
    payoutBank?.ifscCode?.trim() &&
    payoutBank?.bankName?.trim();
  const hasPayoutUpi = !!(payoutUpiId && String(payoutUpiId).trim());
  const hasPayoutQr = !!(payoutQr?.url);
  const payoutMethodCount = [hasPayoutBank, hasPayoutUpi, hasPayoutQr].filter(Boolean).length;
  const hasCashInHand = cashInHand > 0.01;
  // Withdrawable amount = pocket balance (includes bonus + earnings)
  const withdrawableAmount = pocketBalance > 0 ? pocketBalance : 0;
  // Show potential withdrawable after depositing cash-in-hand
  const displayWithdrawAmount = hasCashInHand ?
    Math.max(0, pocketBalance + cashInHand) :
    withdrawableAmount;

  // Withdrawal allowed only when withdrawable amount >= withdrawal limit AND no pending requests exist
  const hasPendingWithdrawal = (balances.pendingWithdrawals || 0) > 0;
  const canWithdraw = withdrawableAmount >= withdrawalLimit && withdrawableAmount > 0 && !hasCashInHand && !hasPendingWithdrawal;
  // Get current week date range
  const getCurrentWeekRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const formatDate = (date) => {
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'short' });
      return `${day} ${month}`;
    };

    return `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;
  };

  const loadPayoutProfile = async () => {
    try {
      setPayoutLoading(true);
      const res = await deliveryAPI.getProfile();
      const profile = res?.data?.data?.profile ?? res?.data?.profile ?? null;
      setPayoutProfile(profile);
    } catch (e) {
      setPayoutProfile(null);
    } finally {
      setPayoutLoading(false);
    }
  };

  const openWithdrawModal = () => {
    setWithdrawAmount("");
    loadPayoutProfile();
    setShowWithdrawModal(true);
  };

  const handleWithdrawSubmit = async () => {
    const num = Number(withdrawAmount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (hasCashInHand) {
      toast.error(`Please deposit cash in hand (${formatCurrency(cashInHand)}) before requesting withdrawal.`);
      return;
    }
    if (num < withdrawalLimit) {
      toast.error(`Minimum withdrawal is ${formatCurrency(withdrawalLimit)}`);
      return;
    }
    if (num > withdrawableAmount) {
      toast.error(`Maximum withdrawable is ${formatCurrency(withdrawableAmount)}`);
      return;
    }

    let profile = payoutProfile;
    if (!profile) {
      try {
        const res = await deliveryAPI.getProfile();
        profile = res?.data?.data?.profile ?? res?.data?.profile;
      } catch (e) {
        toast.error("Failed to load profile");
        return;
      }
    }

    const docs = profile?.documents || {};
    const b = docs.bankDetails;
    const upiId = docs.upiId;
    const qrCode = docs.qrCode;
    const hasBank =
      b?.accountHolderName?.trim() &&
      b?.accountNumber?.trim() &&
      b?.ifscCode?.trim() &&
      b?.bankName?.trim();
    const hasUpi = !!(upiId && String(upiId).trim());
    const hasQr = !!(qrCode?.url);

    if (!hasBank && !hasUpi && !hasQr) {
      toast.error("Add payout details (bank/UPI/QR) first");
      setShowWithdrawModal(false);
      navigate("/delivery/profile/details");
      return;
    }

    setWithdrawSubmitting(true);
    try {
      const payload = {
        amount: num,
        paymentMethod: "admin_select"
      };

      const res = await deliveryAPI.createWithdrawalRequest(payload, { skipErrorToast: true });
      if (res?.data?.success) {
        toast.success("Withdrawal request submitted");
        setShowWithdrawModal(false);
        setWithdrawAmount("");
        fetchWalletData();
        window.dispatchEvent(new Event("deliveryWalletStateUpdated"));
      } else {
        toast.error(res?.data?.message || "Failed to submit withdrawal");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to submit withdrawal");
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">

      {/* Top Bar */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <ArrowLeft onClick={() => navigate(-1)} size={22} className="cursor-pointer" />
        <h1 className="text-lg font-semibold">Pocket balance</h1>
      </div>

      {/* Warning Banner – when withdraw disabled */}
      {!canWithdraw &&
        <div className="bg-yellow-400 p-4 flex items-start gap-3 text-black">
          <AlertTriangle size={20} />
          <div className="text-sm leading-tight">
            <p className="font-semibold">Withdraw currently disabled</p>
            <p className="text-xs">
              {hasPendingWithdrawal ?
                "You already have a pending withdrawal request. Please wait until it is processed." :
                hasCashInHand ?
                  `Please deposit cash in hand (${formatCurrency(cashInHand)}) before requesting withdrawal.` :
                  withdrawableAmount <= 0 ?
                    `Withdrawable amount is ${formatCurrency(0)}` :
                    `Minimum withdrawable amount is ${formatCurrency(withdrawalLimit)}.`}
            </p>
          </div>
        </div>
      }

      {/* Withdraw Section */}
      <div className="px-5 py-6 flex flex-col items-center text-center">
        <p className="text-sm text-gray-600 mb-1">Withdraw amount</p>
        <p className="text-4xl font-bold mb-2">{formatCurrency(displayWithdrawAmount)}</p>
        {hasCashInHand && (
          <p className="text-xs text-amber-700 mb-4">You need to deposit cash first</p>
        )}

        <button
          disabled={!canWithdraw}
          onClick={() => canWithdraw && openWithdrawModal()}
          className={`w-full font-medium py-3 rounded-lg ${canWithdraw ?
            "bg-black text-white hover:bg-gray-800" :
            "bg-gray-200 text-gray-500 cursor-not-allowed"}`
          }>

          Withdraw
        </button>
      </div>

      {/* Withdraw amount popup */}
      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent className="max-w-sm bg-white p-0 rounded-xl">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-lg font-semibold text-black">Withdraw amount</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payout details</label>
              <p className="text-xs text-gray-500">Admin will choose the payout method using your saved details.</p>
              {payoutLoading && (
                <p className="text-xs text-gray-500 mt-2">Loading payout details...</p>
              )}
              {!payoutLoading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Saved methods: {payoutMethodCount || 0}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWithdrawModal(false)
                        navigate("/delivery/profile/details")
                      }}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Update payout details
                    </button>
                  </div>
                  <details className="mt-2 rounded-lg border border-gray-200 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-700">
                      View saved payout details
                    </summary>
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="border border-gray-200 rounded-lg p-2">
                        <p className="font-semibold text-gray-700">Bank transfer</p>
                        {hasPayoutBank ? (
                          <div className="text-gray-600 mt-1 space-y-1">
                            <p>Account Holder: {payoutBank?.accountHolderName || "-"}</p>
                            <p>Account: {payoutBank?.accountNumber ? `****${payoutBank.accountNumber.slice(-4)}` : "-"}</p>
                            <p>IFSC: {payoutBank?.ifscCode || "-"}</p>
                            <p>Bank: {payoutBank?.bankName || "-"}</p>
                          </div>
                        ) : (
                          <p className="text-rose-600 mt-1">Not added</p>
                        )}
                      </div>
                      <div className="border border-gray-200 rounded-lg p-2">
                        <p className="font-semibold text-gray-700">UPI</p>
                        {hasPayoutUpi ? (
                          <p className="text-gray-600 mt-1">UPI ID: {payoutUpiId}</p>
                        ) : (
                          <p className="text-rose-600 mt-1">Not added</p>
                        )}
                      </div>
                      <div className="border border-gray-200 rounded-lg p-2">
                        <p className="font-semibold text-gray-700">QR Code</p>
                        {hasPayoutQr ? (
                          <a
                            href={payoutQr?.url}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-700 mt-1 inline-flex"
                          >
                            Download QR code
                          </a>
                        ) : (
                          <p className="text-rose-600 mt-1">Not added</p>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
              <input
                type="number"
                min={withdrawalLimit}
                max={withdrawableAmount}
                step="1"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black" />

              <p className="text-xs text-gray-500 mt-1">
                Min {formatCurrency(withdrawalLimit)} · Max {formatCurrency(withdrawableAmount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWithdrawAmount(String(withdrawableAmount))}
              className="w-full py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">

              Use full amount ({formatCurrency(withdrawableAmount)})
            </button>
          </div>
          <DialogFooter className="px-5 pb-5 flex gap-3">
            <button
              onClick={() => setShowWithdrawModal(false)}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">

              Cancel
            </button>
            <button
              onClick={handleWithdrawSubmit}
              disabled={withdrawSubmitting}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">

              {withdrawSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {withdrawSubmitting ? "Submitting…" : "Withdraw"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section Header */}
      <div className=" bg-gray-100 py-2 pt-4 text-center text-xs font-semibold text-gray-600">
        POCKET DETAILS • {getCurrentWeekRange()}
      </div>

      {/* Detail Rows */}
      <div className="px-4 pt-2">

        <DetailRow label="Earnings" value={formatCurrency(totalEarnings)} />
        <DetailRow label="Bonus" value={formatCurrency(totalBonus)} />
        <DetailRow label="Tips" value={formatCurrency(totalTips)} />
        <DetailRow label="Amount withdrawn" value={formatCurrency(totalWithdrawn)} />
        <DetailRow label="Cash collected" value={formatCurrency(cashCollected)} />
        <DetailRow label="Deductions" value={formatCurrency(deductions)} />
        <DetailRow label="Pocket balance" value={formatCurrency(pocketBalance)} />

        <DetailRow
          label={
            <div>
              Min. withdrawal amount
              <p className="text-xs text-gray-500">
                Withdrawal allowed only when withdrawable amount ≥ this
              </p>
            </div>
          }
          value={formatCurrency(withdrawalLimit)}
          multiline />


        <DetailRow label="Withdrawable amount" value={formatCurrency(withdrawableAmount)} />

      </div>
    </div>);

}

/* Reusable row component */
function DetailRow({ label, value, multiline = false }) {
  return (
    <div className="py-3 flex justify-between items-start border-b border-gray-100">
      <div className={`text-sm ${multiline ? "" : "font-medium"} text-gray-800`}>
        {label}
      </div>
      <div className="text-sm font-semibold text-black">{value}</div>
    </div>);

}
