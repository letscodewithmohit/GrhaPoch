import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"

export default function SignupStep1() {
  const navigate = useNavigate()
  // Initialize form data from localStorage for instant loading
  const getInitialFormData = () => {
    const savedUser = localStorage.getItem("delivery_user")
    if (savedUser) {
      try {
        const profile = JSON.parse(savedUser)
        return {
          name: profile.name || "",
          email: profile.email || "",
          address: profile.location?.addressLine1 || "",
          city: profile.location?.city || "",
          state: profile.location?.state || "",
          vehicleType: profile.vehicle?.type || "bike",
          vehicleName: profile.vehicle?.name || profile.vehicle?.brand || "",
          vehicleModel: profile.vehicle?.model || "",
          vehicleNumber: profile.vehicle?.number || "",
          panNumber: profile.documents?.pan?.number || "",
          aadharNumber: profile.documents?.aadhar?.number || ""
        }
      } catch (e) {
        console.error("Error parsing saved user data:", e)
      }
    }
    return {
      name: "",
      email: "",
      address: "",
      city: "",
      state: "",
      vehicleType: "bike",
      vehicleName: "",
      vehicleModel: "",
      vehicleNumber: "",
      panNumber: "",
      aadharNumber: ""
    }
  }

  const [formData, setFormData] = useState(getInitialFormData())
  const [initialData, setInitialData] = useState(getInitialFormData())
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(!localStorage.getItem("delivery_user"))
  const [showExitModal, setShowExitModal] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Only show loading spinner if we don't have any data yet
        if (!formData.name) {
          setLoading(true)
        }

        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile

          // Update localStorage with fresh data
          localStorage.setItem("delivery_user", JSON.stringify(profile))

          const data = {
            name: profile.name || "",
            email: profile.email || "",
            address: profile.location?.addressLine1 || "",
            city: profile.location?.city || "",
            state: profile.location?.state || "",
            vehicleType: profile.vehicle?.type || "bike",
            vehicleName: profile.vehicle?.name || profile.vehicle?.brand || "",
            vehicleModel: profile.vehicle?.model || "",
            vehicleNumber: profile.vehicle?.number || "",
            panNumber: profile.documents?.pan?.number || "",
            aadharNumber: profile.documents?.aadhar?.number || ""
          }
          setFormData(data)
          setInitialData(data)
        }
      } catch (error) {
        console.error("Error fetching profile for pre-fill:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "vehicleNumber") {
      const hasSpecialChars = /[^A-Z0-9]/i.test(value);
      if (hasSpecialChars) {
        setErrors(prev => ({ ...prev, vehicleNumber: "Special characters not allowed" }));
      } else {
        setErrors(prev => ({ ...prev, vehicleNumber: "" }));
      }
      setFormData(prev => ({
        ...prev,
        [name]: value.toUpperCase().replace(/[^A-Z0-9]/g, "")
      }))
      return;
    }

    if (name === "aadharNumber") {
      const hasInvalidChars = /[^0-9]/g.test(value);
      if (hasInvalidChars) {
        setErrors(prev => ({ ...prev, aadharNumber: "Only numbers are allowed" }));
      } else {
        setErrors(prev => ({ ...prev, aadharNumber: "" }));
      }
      setFormData(prev => ({
        ...prev,
        [name]: value.replace(/[^0-9]/g, "")
      }))
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ""
      }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format"
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required"
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required"
    }

    if (!formData.state.trim()) {
      newErrors.state = "State is required"
    }

    if (!formData.vehicleName.trim()) {
      newErrors.vehicleName = "Vehicle name is required"
    }

    if (!formData.vehicleNumber.trim()) {
      newErrors.vehicleNumber = "Vehicle number is required"
    }

    if (!formData.panNumber.trim()) {
      newErrors.panNumber = "PAN number is required"
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber.toUpperCase())) {
      newErrors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)"
    }

    if (!formData.aadharNumber.trim()) {
      newErrors.aadharNumber = "Aadhar number is required"
    } else if (!/^\d{12}$/.test(formData.aadharNumber.replace(/\s/g, ""))) {
      newErrors.aadharNumber = "Aadhar number must be 12 digits"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) {
      toast.error("Please fill all required fields correctly")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await deliveryAPI.submitSignupDetails({
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        vehicleType: formData.vehicleType,
        vehicleName: formData.vehicleName.trim(),
        vehicleModel: formData.vehicleModel.trim() || null,
        vehicleNumber: formData.vehicleNumber.trim(),
        panNumber: formData.panNumber.trim().toUpperCase(),
        aadharNumber: formData.aadharNumber.replace(/\s/g, "")
      })

      if (response?.data?.success) {
        const hasChanged = initialData && JSON.stringify(initialData) !== JSON.stringify(formData)
        if (hasChanged) {
          toast.success("Details saved successfully", { duration: 2000 })
        }
        navigate("/delivery/signup/documents")
      }
    } catch (error) {
      console.error("Error submitting signup details:", error)
      const message = error?.response?.data?.message || "Failed to save details. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelSignup = async () => {
    try {
      await deliveryAPI.cancelSignup()
      // Clear all delivery session data to prevent stale redirects
      localStorage.removeItem("delivery_accessToken")
      localStorage.removeItem("delivery_authenticated")
      localStorage.removeItem("delivery_user")
      localStorage.removeItem("delivery_uploaded_docs")
      navigate("/delivery/sign-in", { replace: true })
    } catch (error) {
      console.error("Error cancelling signup:", error)
      toast.error("Failed to clear session. Please try again.")
    }
  }

  const ConfirmExitModal = () => {
    if (!showExitModal) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="p-8 text-center">
            <p className="text-xl font-semibold text-gray-800 leading-relaxed mb-8">
              Are you sure you want to go back without completing the signup process?
            </p>
            <div className="space-y-4">
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full py-3 px-4 bg-[#00B761] hover:bg-[#00A055] text-white font-bold rounded-xl transition-colors"
              >
                Continue Signup
              </button>
              <button
                onClick={handleCancelSignup}
                className="w-full py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setShowExitModal(true)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Complete Your Profile</h1>
      </div>

      <ConfirmExitModal />

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Basic Details</h2>
          <p className="text-sm text-gray-600">Please provide your information to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.name ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="Enter your full name"
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email (Optional)
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.email ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="Enter your email"
            />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={3}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.address ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="Enter your address"
            />
            {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
          </div>

          {/* City and State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.city ? "border-red-500" : "border-gray-300"
                  }`}
                placeholder="City"
              />
              {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.state ? "border-red-500" : "border-gray-300"
                  }`}
                placeholder="State"
              />
              {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
            </div>
          </div>

          {/* Vehicle Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Type <span className="text-red-500">*</span>
            </label>
            <select
              name="vehicleType"
              value={formData.vehicleType}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="bike">Bike</option>
              <option value="scooter">Scooter</option>
              <option value="bicycle">Bicycle</option>
              <option value="car">Car</option>
            </select>
          </div>

          {/* Vehicle Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="vehicleName"
              value={formData.vehicleName}
              onChange={handleChange}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.vehicleName ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="e.g., Honda"
            />
            {errors.vehicleName && <p className="text-red-500 text-sm mt-1">{errors.vehicleName}</p>}
          </div>

          {/* Vehicle Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Model (Optional)
            </label>
            <input
              type="text"
              name="vehicleModel"
              value={formData.vehicleModel}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g., Activa"
            />
          </div>

          {/* Vehicle Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="vehicleNumber"
              value={formData.vehicleNumber}
              onChange={handleChange}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.vehicleNumber ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="e.g., MH12AB1234"
            />
            {errors.vehicleNumber && <p className="text-red-500 text-sm mt-1">{errors.vehicleNumber}</p>}
          </div>

          {/* PAN Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PAN Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="panNumber"
              value={formData.panNumber}
              onChange={handleChange}
              maxLength={10}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${errors.panNumber ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="ABCDE1234F"
            />
            {errors.panNumber && <p className="text-red-500 text-sm mt-1">{errors.panNumber}</p>}
          </div>

          {/* Aadhar Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aadhar Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="aadharNumber"
              value={formData.aadharNumber}
              onChange={handleChange}
              maxLength={12}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.aadharNumber ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="1234 5678 9012"
            />
            {errors.aadharNumber && <p className="text-red-500 text-sm mt-1">{errors.aadharNumber}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  )
}

