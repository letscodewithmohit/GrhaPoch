import { formatCurrency } from "../../restaurant/utils/currency"

export default function AvailableCashLimit({ onClose, walletData = {} }) {
  const rawLimit = Number(walletData.totalCashLimit)
  const totalCashLimit = Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 0
  const cashInHand = Number(walletData.cashInHand) || 0
  const deductions = Number(walletData.deductions) || 0
  const pocketWithdrawals = Number(walletData.pocketWithdrawals) || 0
  const availableCashLimit = Math.max(0, totalCashLimit - cashInHand - deductions)

  return (
    <div className="bg-white text-black flex flex-col no-scrollbar pt-2 mt-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="">
        <div className="py-3 flex justify-between border-b border-gray-200 items-start">
          <div>
            <div className="text-sm font-medium">Total cash limit</div>
            <div className="text-sm font-medium text-gray-600 leading-tight mt-1">
              Resets every Monday and increases with<br />
              earnings
            </div>
          </div>
          <div className="text-sm font-semibold">{formatCurrency(totalCashLimit)}</div>
        </div>

        <DetailRow label="Cash in hand" value={formatCurrency(cashInHand)} />
        <DetailRow label="Deductions" value={formatCurrency(deductions)} />
        <DetailRow label="Pocket withdrawals" value={formatCurrency(pocketWithdrawals)} />

        <div className="py-3 flex justify-between items-center border-b border-gray-100">
          <div className="text-sm font-medium">Available cash limit</div>
          <div className="text-sm font-semibold">{formatCurrency(availableCashLimit)}</div>
        </div>
      </div>

      <div onClick={onClose} className="mt-8 pb-2">
        <button className="w-full bg-black text-white py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform">
          Okay
        </button>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="py-3.5 flex justify-between items-center border-b border-gray-50">
      <div className="text-sm font-medium text-gray-600">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  )
}
