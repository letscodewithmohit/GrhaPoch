import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { deliveryAPI } from "@/lib/api"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"

// Common country codes
const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+7", country: "RU", flag: "🇷🇺" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
]

export default function DeliverySignIn() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState(() => {
    try {
      const stored = sessionStorage.getItem("deliveryAuthData")
      if (stored) {
        const data = JSON.parse(stored)
        if (data && data.phone && data.method === "phone") {
          const parts = data.phone.split(" ")
          if (parts.length >= 2) {
            return {
              countryCode: parts[0],
              phone: parts.slice(1).join("").replace(/\D/g, "")
            }
          }
        }
      }
    } catch (e) {
      // Ignore error
    }
    return {
      phone: "",
      countryCode: "+91",
    }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)

  // Privacy Policy state
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [privacyContent, setPrivacyContent] = useState("")
  const [loadingPrivacy, setLoadingPrivacy] = useState(false)

  // Terms of Service state
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [termsContent, setTermsContent] = useState("")
  const [loadingTerms, setLoadingTerms] = useState(false)

  // Fetch Privacy Policy
  const fetchPrivacyPolicy = async () => {
    try {
      setLoadingPrivacy(true)
      setShowPrivacyModal(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC)
      if (response.data.success) {
        setPrivacyContent(response.data.data.content || "No privacy policy content available.")
      } else {
        setPrivacyContent("Failed to load privacy policy.")
      }
    } catch (err) {
      console.error("Error fetching privacy policy:", err)
      setPrivacyContent("Unable to load privacy policy at this time.")
    } finally {
      setLoadingPrivacy(false)
    }
  }

  // Fetch Terms of Service
  const fetchTermsOfService = async () => {
    try {
      setLoadingTerms(true)
      setShowTermsModal(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC)
      if (response.data.success) {
        setTermsContent(response.data.data.content || "No terms of service content available.")
      } else {
        setTermsContent("Failed to load terms of service.")
      }
    } catch (err) {
      console.error("Error fetching terms of service:", err)
      setTermsContent("Unable to load terms of service at this time.")
    } finally {
      setLoadingTerms(false)
    }
  }

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[2] // Default to India (+91)

  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }

    const digitsOnly = phone.replace(/\D/g, "")

    if (digitsOnly.length < 7) {
      return "Phone number must be at least 7 digits"
    }

    // India-specific validation
    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) {
        return "Indian phone number must be 10 digits"
      }
      const firstDigit = digitsOnly[0]
      if (!["6", "7", "8", "9"].includes(firstDigit)) {
        return "Invalid Indian mobile number"
      }
    }

    return ""
  }

  const handleSendOTP = async () => {
    setError("")

    const phoneError = validatePhone(formData.phone, formData.countryCode)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)

      // Call backend to send OTP for delivery login
      await deliveryAPI.sendOTP(fullPhone, "login")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "delivery",
      }
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/delivery/otp")
    } catch (err) {
      console.error("Send OTP Error:", err)
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send OTP. Please try again."
      setError(message)
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    // Only allow digits
    const value = e.target.value.replace(/\D/g, "")
    setFormData({
      ...formData,
      phone: value,
    })
  }

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value,
    })
  }

  const isValid = !validatePhone(formData.phone, formData.countryCode)

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      {/* Header with Back Button */}
      <div className="relative flex items-center justify-center py-4 px-4 mt-2">
        {/* Back button removed as per request */}
      </div>

      {/* Top Section - Logo and Badge */}
      <div className="flex flex-col items-center pt-8 pb-8 px-6">
        {/* Logo */}
        <div>
          <h1
            className="text-3xl italic md:text-4xl tracking-wide font-extrabold text-black"
            style={{
              WebkitTextStroke: "0.5px black",
              textStroke: "0.5px black"
            }}
          >
            Grha Poch
          </h1>
        </div>

        {/* Delivery Partner Badge */}
        <div className="">
          <span className="text-gray-600 font-light text-sm tracking-wide block text-center">
            — delivery partner —
          </span>
        </div>
      </div>

      {/* Main Content - Form Section */}
      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-6 py-4">
          {/* Instruction Text */}
          <div className="text-center">
            <p className="text-base text-gray-700 leading-relaxed">
              Enter your registered phone number and we will send an OTP to continue
            </p>
          </div>

          {/* Phone Number Input */}
          <div className="space-y-4">
            <div className="flex gap-2 items-stretch w-full">
              {/* Country Code Selector */}
              <Select
                value={formData.countryCode}
                onValueChange={handleCountryCodeChange}
              >
                <SelectTrigger className="w-[100px] h-12 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center shrink-0">
                  <SelectValue>
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">{selectedCountry.flag}</span>
                      <span className="text-sm font-medium text-gray-900">{selectedCountry.code}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {countryCodes.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <span className="flex items-center gap-2">
                        <span>{country.flag}</span>
                        <span>{country.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Phone Number Input */}
              <div className="flex-1 flex flex-col">
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  autoComplete="off"
                  autoFocus={false}
                  className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg min-w-0 bg-white ${error && formData.phone.length > 0
                    ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    }`}
                  style={{ height: '48px' }}
                />
                {error && formData.phone.length > 0 && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{error}</p>
                )}
              </div>
            </div>

            {/* Send OTP Button */}
            <button
              onClick={handleSendOTP}
              disabled={!isValid || isSending}
              className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${isValid && !isSending
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
            >
              {isSending ? "Sending OTP..." : "Send OTP"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section - Terms and Conditions */}
      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto">
          <p className="text-xs text-center text-gray-600 leading-relaxed">
            By continuing, you agree to our
          </p>
          <div className="text-xs text-center text-gray-600 mt-1 flex justify-center gap-1.5 flex-wrap">
            <span
              onClick={fetchTermsOfService}
              className="underline cursor-pointer hover:text-black"
            >
              Terms of Service
            </span>
            <span>|</span>
            <span
              onClick={fetchPrivacyPolicy}
              className="underline cursor-pointer hover:text-black"
            >
              Privacy Policy
            </span>
          </div>
        </div>
      </div>

      {/* Privacy Policy Modal */}
      <AnimatePresence>
        {showPrivacyModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPrivacyModal(false)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden"
            >
              <div className="relative flex items-center justify-center p-4 border-b border-gray-100 shrink-0 bg-white">
                <h2 className="text-xl font-bold text-gray-900 text-center pointer-events-none">Privacy Policy</h2>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="absolute right-4 p-2 bg-gray-100 hover:bg-red-100 rounded-full transition-all group z-10 cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-700 group-hover:text-red-500 transition-colors" />
                </button>
              </div>

              <div className="p-4 pt-2 overflow-y-auto flex-1 bg-white">
                {loadingPrivacy ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-500 font-medium">Loading privacy policy...</p>
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-gray-600 space-y-3 font-medium leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: privacyContent }}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Terms of Service Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTermsModal(false)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden"
            >
              <div className="relative flex items-center justify-center p-4 border-b border-gray-100 shrink-0 bg-white">
                <h2 className="text-xl font-bold text-gray-900 text-center pointer-events-none">Terms of Service</h2>
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="absolute right-4 p-2 bg-gray-100 hover:bg-red-100 rounded-full transition-all group z-10 cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-700 group-hover:text-red-500 transition-colors" />
                </button>
              </div>

              <div className="p-4 pt-2 overflow-y-auto flex-1 bg-white">
                {loadingTerms ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-500 font-medium">Loading terms of service...</p>
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-gray-600 space-y-3 font-medium leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: termsContent }}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
