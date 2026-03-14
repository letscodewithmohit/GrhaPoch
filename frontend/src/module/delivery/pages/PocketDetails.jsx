import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Loader2,
  Package,
  IndianRupee,
  Gift
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import WeekSelector from "../components/WeekSelector"
import { deliveryAPI } from "@/lib/api"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"

export default function PocketDetails() {
  const navigate = useNavigate()

  // Current week range (Sunday–Saturday)
  const getInitialWeekRange = () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  const [weekRange, setWeekRange] = useState(getInitialWeekRange)
  const [orders, setOrders] = useState([])
  const [paymentTransactions, setPaymentTransactions] = useState([])
  const [bonusTransactions, setBonusTransactions] = useState([])
  const [tipTransactions, setTipTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  // Load trips (orders), payment transactions, and bonus for selected week
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // 1) Fetch trips for selected week
        const params = {
          period: "weekly",
          date: weekRange.start.toISOString().split("T")[0],
          status: "Completed",
          limit: 1000
        }
        const response = await deliveryAPI.getTripHistory(params)
        const trips = response?.data?.data?.trips || []

        // Filter trips within the selected week range
        const filteredTrips = trips.filter((trip) => {
          const tripDate = trip.deliveredAt || trip.completedAt || trip.createdAt || trip.date
          if (!tripDate) return false
          const d = new Date(tripDate)
          return d >= weekRange.start && d <= weekRange.end
        })

        // 2) Fetch payment transactions (earnings) for mapping by orderId
        const payments = await fetchWalletTransactions({ type: "payment", limit: 1000 })

        // Filter payments within the selected week range
        const filteredPayments = payments.filter((p) => {
          const paymentDate = p.date || p.createdAt
          if (!paymentDate) return false
          const d = new Date(paymentDate)
          return d >= weekRange.start && d <= weekRange.end && p.status === "Completed"
        })

        // 3) Fetch bonus transactions
        const bonuses = await fetchWalletTransactions({ type: "bonus", limit: 1000 })
        const earningAddons = await fetchWalletTransactions({ type: "earning_addon", limit: 1000 })
        const allBonuses = [...bonuses, ...earningAddons]
        
        // Filter bonuses within the selected week range
        const filteredBonuses = allBonuses.filter((b) => {
          const bonusDate = b.date || b.createdAt
          if (!bonusDate) return false
          const d = new Date(bonusDate)
          return d >= weekRange.start && d <= weekRange.end && b.status === "Completed"
        })

        // 4) Fetch tip transactions for mapping by orderId
        const tips = await fetchWalletTransactions({ type: "tip", limit: 1000 })

        // Filter tips within the selected week range
        const filteredTipsTransactions = tips.filter((t) => {
          const tipDate = t.date || t.createdAt
          if (!tipDate) return false
          const d = new Date(tipDate)
          return d >= weekRange.start && d <= weekRange.end && t.status === "Completed"
        })

        // 5) Create pseudo-orders for any transactions that don't have a matching trip
        const existingOrderIds = new Set()
        filteredTrips.forEach((o) => {
          if (o?.orderId) existingOrderIds.add(String(o.orderId))
          if (o?._id) existingOrderIds.add(String(o._id))
          if (o?.id) existingOrderIds.add(String(o.id))
        })
        const allTransactions = [...filteredPayments, ...filteredBonuses, ...filteredTipsTransactions]
        
        const standaloneOrders = []
        allTransactions.forEach(txn => {
          const id = txn.orderId || txn.metadata?.orderId
          
          if (id) {
            if (!existingOrderIds.has(String(id))) {
              standaloneOrders.push({
                _id: String(id),
                orderId: String(id),
                createdAt: txn.date || txn.createdAt,
                restaurantName: txn.metadata?.restaurantName || "Unknown",
                paymentMethod: "Online",
                isStandalone: true
              })
              existingOrderIds.add(String(id))
            }
          } else {
            // General transaction without order ID (like joining bonus or general earning addon)
            const pseudoId = `txn_${txn._id || Math.random().toString(36).substr(2, 9)}`
            if (!existingOrderIds.has(pseudoId)) {
              let title = "Bonus"
              if (txn.type === "earning_addon") title = "Earning Addon Target"
              if (txn.type === "tip") title = "Tip"
              if (txn.type === "payment") title = "Payment"

              standaloneOrders.push({
                _id: pseudoId,
                orderId: title,
                createdAt: txn.date || txn.createdAt,
                restaurantName: txn.description || title,
                paymentMethod: "System",
                isStandalone: true,
                _txnRef: txn
              })
              existingOrderIds.add(pseudoId)
            }
          }
        })
        
        // Sort combining filteredTrips and standaloneOrders by date descending
        const allOrders = [...filteredTrips, ...standaloneOrders].sort((a, b) => {
          const dateA = new Date(a.deliveredAt || a.completedAt || a.createdAt || a.date || 0)
          const dateB = new Date(b.deliveredAt || b.completedAt || b.createdAt || b.date || 0)
          return dateB - dateA
        })

        setOrders(allOrders)
        setPaymentTransactions(filteredPayments)
        setBonusTransactions(filteredBonuses)
        setTipTransactions(filteredTipsTransactions)
      } catch (error) {
        console.error("Error loading pocket details data:", error)
        setOrders([])
        setPaymentTransactions([])
        setBonusTransactions([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [weekRange])

  // Compute summary for selected week
  const summary = useMemo(() => {
    const normalizeId = (id) => (id ? String(id) : "")
    const paymentTipFor = (payment) => Number(payment?.metadata?.tip ?? payment?.metadata?.tipAmount ?? 0) || 0
    const tipByOrder = new Map()
    tipTransactions.forEach((t) => {
      const tipOrderId = t.orderId || t.metadata?.orderId
      const key = normalizeId(tipOrderId)
      if (!key) return
      tipByOrder.set(key, (tipByOrder.get(key) || 0) + (t.amount || 0))
    })
    let totalEarning = 0
    let totalBonus = 0
    let totalTip = 0

    // Calculate total earning from payment transactions
    paymentTransactions.forEach((p) => {
      const amount = Number(p.amount) || 0
      const orderId = normalizeId(p.orderId || p.metadata?.orderId)
      const tipFromTxn = orderId ? (tipByOrder.get(orderId) || 0) : 0
      const tipFromPayment = paymentTipFor(p)
      const tipForOrder = tipFromTxn > 0 ? tipFromTxn : tipFromPayment
      totalEarning += Math.max(0, amount - tipForOrder)

      // If no tip transaction exists, but payment metadata has tip, count it once
      if (tipFromTxn <= 0 && tipFromPayment > 0) {
        totalTip += tipFromPayment
      }
    })

    // Total bonus for this week
    bonusTransactions.forEach((b) => {
      totalBonus += b.amount || 0
    })

    // Total tips for this week
    tipTransactions.forEach((t) => {
      totalTip += t.amount || 0
    })

    return {
      totalEarning,
      totalBonus,
      totalTip,
      grandTotal: totalEarning + totalBonus + totalTip
    }
  }, [paymentTransactions, bonusTransactions, tipTransactions])

  // Helper: Get earning for a specific order from payment transactions
  const getOrderEarning = (orderId) => {
    if (!orderId) return 0
    const normalizeId = (id) => (id ? String(id) : "")
    const paymentTipFor = (payment) => Number(payment?.metadata?.tip ?? payment?.metadata?.tipAmount ?? 0) || 0
    // Try to find payment transaction by orderId
    const payment = paymentTransactions.find((p) => {
      const paymentOrderId = p.orderId || p.metadata?.orderId
      return paymentOrderId && String(paymentOrderId) === String(orderId)
    })
    if (payment) {
      const amount = Number(payment.amount) || 0
      const tipTxn = tipTransactions.find((t) => {
        const tipOrderId = t.orderId || t.metadata?.orderId
        return tipOrderId && normalizeId(tipOrderId) === normalizeId(orderId)
      })
      const tipFromTxn = tipTxn ? (tipTxn.amount || 0) : 0
      const tipFromPayment = paymentTipFor(payment)
      const tipForOrder = tipFromTxn > 0 ? tipFromTxn : tipFromPayment
      return Math.max(0, amount - tipForOrder)
    }

    // Fallback: try to match by date (same day)
    const order = orders.find(o => {
      const oId = o.orderId || o._id || o.id
      return String(oId) === String(orderId)
    })
    if (order) {
      const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
      if (orderDate) {
        const orderDateObj = new Date(orderDate)
        const matchingPayment = paymentTransactions.find((p) => {
          const paymentDate = new Date(p.date || p.createdAt)
          return paymentDate.toDateString() === orderDateObj.toDateString()
        })
        if (matchingPayment) return matchingPayment.amount || 0
      }

      // Last fallback: use order's own earning field
      return (
        order.deliveryEarning ||
        order.deliveryPayout ||
        order.payout ||
        order.estimatedEarnings?.totalEarning ||
        order.amount ||
        0
      )
    }
    return 0
  }

  // Helper: Get bonus for a specific order
  const getOrderBonus = (orderId) => {
    if (!orderId) return 0
    // Try to find bonus transaction by orderId
    const bonus = bonusTransactions.find((b) => {
      const bonusOrderId = b.orderId || b.metadata?.orderId
      return bonusOrderId && String(bonusOrderId) === String(orderId)
    })
    if (bonus) return bonus.amount || 0

    // Fallback: try to match by date (same day)
    const order = orders.find(o => {
      const oId = o.orderId || o._id || o.id
      return String(oId) === String(orderId)
    })
    if (order) {
      const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
      if (orderDate) {
        const orderDateObj = new Date(orderDate)
        const matchingBonus = bonusTransactions.find((b) => {
          const bonusDate = new Date(b.date || b.createdAt)
          return bonusDate.toDateString() === orderDateObj.toDateString()
        })
        if (matchingBonus) return matchingBonus.amount || 0
      }
    }
    return 0
  }

  // Helper: Get tip for a specific order
  const getOrderTip = (orderId) => {
    if (!orderId) return 0
    const normalizeId = (id) => (id ? String(id) : "")
    const paymentTipFor = (payment) => Number(payment?.metadata?.tip ?? payment?.metadata?.tipAmount ?? 0) || 0
    // Try to find tip transaction by orderId
    const tip = tipTransactions.find((t) => {
      const tipOrderId = t.orderId || t.metadata?.orderId
      return tipOrderId && String(tipOrderId) === String(orderId)
    })
    if (tip) return tip.amount || 0

    // Fallback: use tip from payment metadata if present
    const payment = paymentTransactions.find((p) => {
      const paymentOrderId = p.orderId || p.metadata?.orderId
      return paymentOrderId && normalizeId(paymentOrderId) === normalizeId(orderId)
    })
    if (payment) {
      const tipFromPayment = paymentTipFor(payment)
      if (tipFromPayment > 0) return tipFromPayment
    }

    // Fallback: try to match by date (same day)
    const order = orders.find(o => {
      const oId = o.orderId || o._id || o.id
      return String(oId) === String(orderId)
    })
    if (order) {
      const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
      if (orderDate) {
        const orderDateObj = new Date(orderDate)
        const matchingTip = tipTransactions.find((t) => {
          const tipDate = new Date(t.date || t.createdAt)
          return tipDate.toDateString() === orderDateObj.toDateString()
        })
        if (matchingTip) return matchingTip.amount || 0
      }
    }
    return 0
  }

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    } catch {
      return "N/A"
    }
  }

  // Get restaurant name from order
  const getRestaurantName = (order) => {
    return (
      order.restaurant ||
      order.restaurantName ||
      order.restaurantId?.name ||
      order.restaurant?.name ||
      "Restaurant"
    )
  }

  // Get order ID for display
  const getOrderId = (order) => {
    return order.orderId || order._id || order.id || "N/A"
  }

  // Get payment method for order
  const getPaymentMethod = (order) => {
    // Try multiple possible fields for payment method
    const paymentMethod = order.paymentMethod ||
      order.payment?.method ||
      (order.payment && typeof order.payment === 'object' ? order.payment.method : null)

    if (!paymentMethod) {
      // Default to Online if not found
      return { type: 'Online', label: 'Online', color: 'text-green-600' }
    }

    const method = String(paymentMethod).toLowerCase().trim()
    // Check if it's COD (cash or cod)
    if (method === 'cash' || method === 'cod') {
      return { type: 'COD', label: 'Cash on Delivery', color: 'text-amber-600' }
    }
    // Otherwise it's online payment (razorpay, wallet, upi, card, etc.)
    return { type: 'Online', label: 'Online', color: 'text-green-600' }
  }


  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Pocket Details</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Week Selector */}
        <div className="mb-6">
          <WeekSelector
            onChange={(range) => setWeekRange(range)}
            weekStartsOn={0}
          />
        </div>

        {/* Summary Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Week Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Orders Earning</span>
              <span className="text-gray-900 font-semibold">{formatCurrency(summary.totalEarning)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Bonus</span>
              <span className="text-green-600 font-semibold">+{formatCurrency(summary.totalBonus)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Customer Tips</span>
              <span className="text-green-600 font-semibold">+{formatCurrency(summary.totalTip)}</span>
            </div>
            <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
              <span className="text-gray-900 font-semibold">Total (Pocket)</span>
              <span className="text-gray-900 text-lg font-bold">{formatCurrency(summary.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-600 text-base">Loading orders...</p>
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Order Details</h2>
            {orders.map((order, index) => {
              const orderId = getOrderId(order)
              let earning = 0
              let bonus = 0
              let tip = 0

              if (order._txnRef) {
                const type = order._txnRef.type
                if (type === "payment") earning = order._txnRef.amount || 0
                else if (type === "bonus" || type === "earning_addon") bonus = order._txnRef.amount || 0
                else if (type === "tip") tip = order._txnRef.amount || 0
              } else {
                earning = getOrderEarning(orderId)
                bonus = getOrderBonus(orderId)
                tip = getOrderTip(orderId)
              }
              const restaurantName = getRestaurantName(order)
              const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
              const paymentInfo = getPaymentMethod(order)

              return (
                <div
                  key={orderId || index}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-900 font-semibold text-sm">
                          {order._txnRef ? orderId : `Order #${orderId}`}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs mb-1">{restaurantName}</p>
                      <p className="text-gray-500 text-xs mb-1">{formatDate(orderDate)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs">Payment:</span>
                        <span className={`text-xs font-semibold ${paymentInfo.color}`}>
                          {paymentInfo.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Earning and Bonus Breakdown */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-600 text-sm">Earning</span>
                      </div>
                      <span className="text-gray-900 font-semibold">{formatCurrency(earning)}</span>
                    </div>
                    {bonus > 0 && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-green-500" />
                          <span className="text-gray-600 text-sm">Bonus</span>
                        </div>
                        <span className="text-green-600 font-semibold">+{formatCurrency(bonus)}</span>
                      </div>
                    )}
                    {tip > 0 && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 flex items-center justify-center bg-green-100 rounded-full">
                            <span className="text-[10px] text-green-600">₹</span>
                          </span>
                          <span className="text-gray-600 text-sm">Tip</span>
                        </div>
                        <span className="text-green-600 font-semibold">+{formatCurrency(tip)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-gray-700 font-medium text-sm">Total</span>
                      <span className="text-gray-900 font-bold">{formatCurrency(earning + bonus + tip)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 text-lg font-semibold mb-2">No orders found</p>
            <p className="text-gray-600 text-sm text-center max-w-xs">
              No completed orders found for the selected week. Your order details will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

