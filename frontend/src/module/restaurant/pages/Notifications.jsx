import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, Calendar, Info, AlertTriangle, CheckCircle, Trash2, CheckCircle2, Loader2 } from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getNotifications()
      const data = response?.data?.data?.notifications || []
      setNotifications(data)
    } catch (error) {
      console.error("Error fetching notifications:", error)
      toast.error("Failed to load notifications")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  const markRead = async (id) => {
    try {
      await restaurantAPI.markNotificationRead(id)
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n))
    } catch (error) {
      console.error("Error marking as read:", error)
    }
  }

  const markAllRead = async () => {
    try {
      await restaurantAPI.markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      toast.success("All notifications marked as read")
    } catch (error) {
      console.error("Error marking all as read:", error)
    }
  }

  const deleteNotification = async (id, e) => {
    e.stopPropagation()
    try {
      await restaurantAPI.deleteNotification(id)
      setNotifications(prev => prev.filter(n => n._id !== id))
      toast.success("Notification deleted")
    } catch (error) {
      console.error("Error deleting notification:", error)
    }
  }

  const getIcon = (type) => {
    switch (type) {
      case 'subscription_expired':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'subscription_activated':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'alert':
        return <Info className="w-5 h-5 text-blue-500" />
      default:
        return <Bell className="w-5 h-5 text-gray-400" />
    }
  }

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now - date) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant/to-hub")}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Notifications</h1>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button
            onClick={markAllRead}
            className="text-xs font-semibold text-[#008069] flex items-center gap-1 hover:underline"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-3 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#008069] mb-4" />
            <p className="text-gray-500 text-sm">Loading your updates...</p>
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {notifications.map((notif) => (
                <motion.div
                  key={notif._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => !notif.isRead && markRead(notif._id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${notif.isRead
                      ? 'bg-white border-gray-100'
                      : 'bg-white border-[#008069]/20 shadow-sm ring-1 ring-[#008069]/5'
                    }`}
                >
                  {!notif.isRead && (
                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#008069]" />
                  )}
                  <div className="flex gap-4">
                    <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${notif.type === 'subscription_expired' ? 'bg-red-50' :
                        notif.type === 'subscription_activated' ? 'bg-green-50' : 'bg-gray-50'
                      }`}>
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className={`text-sm font-bold truncate ${notif.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                          {notif.title}
                        </h3>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {getTimeAgo(notif.createdAt)}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${notif.isRead ? 'text-gray-500' : 'text-gray-600'}`}>
                        {notif.message}
                      </p>

                      <div className="mt-3 flex items-center justify-end">
                        <button
                          onClick={(e) => deleteNotification(notif._id, e)}
                          className="p-1 px-2 text-[10px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-gray-900 font-bold mb-1">Stay Tuned!</h3>
            <p className="text-gray-500 text-xs">
              When we have updates for your restaurant, they'll show up here.
            </p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {notifications.length > 10 && (
        <div className="py-8 text-center">
          <p className="text-[10px] text-gray-400">Showing last 50 notifications</p>
        </div>
      )}
    </div>
  )
}
