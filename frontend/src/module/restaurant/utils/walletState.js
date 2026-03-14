import { restaurantAPI } from '@/lib/api'

// Empty wallet state structure
const EMPTY_WALLET_STATE = {
  totalBalance: 0,
  totalWithdrawn: 0,
  totalEarned: 0,
  transactions: [],
  pendingWithdrawals: 0,
  withdrawalBalance: 0
};

/**
 * Fetch wallet data from API
 * @returns {Promise<Object>} - Wallet state object
 */
export const fetchWalletData = async () => {
  try {
    const response = await restaurantAPI.getWallet();
    if (response?.data?.success && response?.data?.data?.wallet) {
      const walletData = response.data.data.wallet;

      // Calculate pending withdrawals from transactions
      const transactions = walletData.transactions || [];
      const pendingWithdrawals = transactions
        .filter(t => t.type === 'withdrawal' && t.status === 'Pending')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const transformedData = {
        totalBalance: Number(walletData.totalBalance) || 0,
        totalWithdrawn: Number(walletData.totalWithdrawn) || 0,
        totalEarned: Number(walletData.totalEarned) || 0,
        transactions: transactions,
        pendingWithdrawals: pendingWithdrawals,
        // Withdrawable amount is the current totalBalance
        withdrawalBalance: Number(walletData.totalBalance) || 0
      };

      return transformedData;
    }
    return EMPTY_WALLET_STATE;
  } catch (error) {
    console.error('Error fetching restaurant wallet data:', error);
    return EMPTY_WALLET_STATE;
  }
};

/**
 * Calculate balances for display
 * @param {Object} state - Wallet state
 * @returns {Object} - Formatted balances
 */
export const calculateBalances = (state) => {
  if (!state) return {
    cashInHand: 0,
    withdrawalBalance: 0,
    pendingWithdraw: 0,
    alreadyWithdraw: 0,
    totalEarning: 0,
    balanceUnadjusted: 0
  };

  return {
    cashInHand: 0, // Restaurants don't have "Cash in Hand" in this logic
    withdrawalBalance: state.totalBalance || 0,
    pendingWithdraw: state.pendingWithdrawals || 0,
    alreadyWithdraw: state.totalWithdrawn || 0,
    totalEarning: state.totalEarned || 0,
    balanceUnadjusted: 0
  };
};

/**
 * Create a withdraw request via API
 * @param {number} amount - Withdrawal amount
 * @param {string} paymentMethod - Payment method
 * @param {Object} details - Bank/UPI/QR details
 * @returns {Promise<Object>} - API response
 */
export const createWithdrawRequest = async (amount, paymentMethod, details = {}) => {
  try {
    const payload = {
      amount: parseFloat(amount),
      paymentMethod: paymentMethod === 'Admin Select' ? 'admin_select' :
        paymentMethod === 'Bank Transfer' ? 'bank_transfer' :
          paymentMethod.toLowerCase().replace(' ', '_'),
      ...details
    };

    const response = await restaurantAPI.createWithdrawalRequest(payload);
    if (response?.data?.success) {
      window.dispatchEvent(new CustomEvent('walletStateUpdated'));
      return response.data;
    }
    throw new Error(response?.data?.message || 'Failed to create withdrawal request');
  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    throw error;
  }
};

// Deprecated functions kept for compatibility during transition
export const getWalletState = () => EMPTY_WALLET_STATE;
export const getBalanceAdjusted = () => true;
export const setBalanceAdjusted = () => { };
export const getTransactionsByType = (type) => [];
export const getTransactionsByStatus = (status) => [];
export const getOrderPaymentAmount = (orderId) => 0;


