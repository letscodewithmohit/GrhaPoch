import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, Upload, X, QrCode, CreditCard, Smartphone } from "lucide-react";
import { restaurantAPI, uploadAPI } from "@/lib/api";
import { toast } from "sonner";

export default function UpdateBankDetails() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Payout details state
  const [payoutDetails, setPayoutDetails] = useState({
    beneficiaryName: "",
    accountNumber: "",
    ifscCode: "",
    upiId: "",
    qrCode: null,
    lastUpdated: ""
  });

  const [formData, setFormData] = useState({
    beneficiaryName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    upiId: "",
    qrCode: null
  });

  const [errors, setErrors] = useState({
    beneficiaryName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    upiId: ""
  });

  const [touched, setTouched] = useState({
    beneficiaryName: false,
    accountNumber: false,
    confirmAccountNumber: false,
    ifscCode: false,
    upiId: false
  });

  // Fetch current details
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await restaurantAPI.getProfile();
        const bank = res?.data?.data?.restaurant?.onboarding?.step3?.bank;

        if (bank) {
          const initialData = {
            beneficiaryName: bank.accountHolderName || "",
            accountNumber: bank.accountNumber || "",
            ifscCode: bank.ifscCode || "",
            upiId: bank.upiId || "",
            qrCode: bank.qrCode || null,
            lastUpdated: res?.data?.data?.restaurant?.updatedAt ? new Date(res.data.data.restaurant.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ""
          };
          setPayoutDetails(initialData);
          setFormData({
            ...initialData,
            confirmAccountNumber: initialData.accountNumber
          });
        }
      } catch (error) {
        console.error("Error fetching payout details:", error);
        toast.error("Failed to load payout details");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, []);

  // Validation functions
  const validateBeneficiaryName = (name) => {
    if (!name.trim()) return "Beneficiary name is required";
    if (name.trim().length < 3) return "Name too short";
    const nameRegex = /^[A-Za-z\s.]+$/;
    if (!nameRegex.test(name.trim())) return "Invalid characters";
    return "";
  };

  const validateAccountNumber = (accountNumber) => {
    if (!accountNumber.trim()) return "Account number is required";
    const clean = accountNumber.replace(/[\s\-]/g, "");
    if (!/^\d+$/.test(clean)) return "Digits only";
    if (clean.length < 9) return "Too short";
    return "";
  };

  const validateConfirmAccountNumber = (confirm, original) => {
    if (!confirm.trim()) return "Please confirm";
    if (confirm.replace(/[\s\-]/g, "") !== original.replace(/[\s\-]/g, "")) return "Numbers do not match";
    return "";
  };

  const validateIFSC = (ifsc) => {
    if (!ifsc.trim()) return "IFSC required";
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifsc.trim().toUpperCase())) return "Invalid format (e.g., SBIN0018764)";
    return "";
  };

  const validateUPI = (upi) => {
    if (upi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi.trim())) return "Invalid UPI ID format";
    return "";
  };

  const handleInputChange = (field, value) => {
    let processedValue = value;
    if (field === "ifscCode") processedValue = value.toUpperCase();

    setFormData(prev => ({ ...prev, [field]: processedValue }));

    // Validation
    let error = "";
    if (field === "beneficiaryName") error = validateBeneficiaryName(processedValue);
    else if (field === "accountNumber") error = validateAccountNumber(processedValue);
    else if (field === "confirmAccountNumber") error = validateConfirmAccountNumber(processedValue, formData.accountNumber);
    else if (field === "ifscCode") error = validateIFSC(processedValue);
    else if (field === "upiId") error = validateUPI(processedValue);

    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: "restaurant/payout/qr" });
      const data = res?.data?.data;
      if (data?.url) {
        setFormData(prev => ({ ...prev, qrCode: { url: data.url, publicId: data.publicId } }));
        toast.success("QR Code uploaded");
      }
    } catch (error) {
      toast.error("Failed to upload QR Code");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate everything
    const newErrors = {
      beneficiaryName: validateBeneficiaryName(formData.beneficiaryName),
      accountNumber: validateAccountNumber(formData.accountNumber),
      confirmAccountNumber: validateConfirmAccountNumber(formData.confirmAccountNumber, formData.accountNumber),
      ifscCode: validateIFSC(formData.ifscCode),
      upiId: validateUPI(formData.upiId)
    };
    setErrors(newErrors);
    setTouched({ beneficiaryName: true, accountNumber: true, confirmAccountNumber: true, ifscCode: true, upiId: true });

    if (Object.values(newErrors).some(err => err !== "")) return;

    setSaving(true);
    try {
      await restaurantAPI.updatePayoutDetails({
        bank: {
          accountHolderName: formData.beneficiaryName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          accountType: "Savings" // Default
        },
        upiId: formData.upiId || "",
        qrCode: formData.qrCode
      });

      toast.success("Payout details updated successfully");
      setIsEditMode(false);
      setPayoutDetails({
        ...formData,
        lastUpdated: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 bg-white border-b border-gray-200 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Payout & Bank Details</h1>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {!isEditMode ? (
          /* VIEW MODE */
          <div className="space-y-6">
            {/* Bank Card */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-900">Bank Account</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Beneficiary</span>
                  <span className="text-sm font-semibold">{payoutDetails.beneficiaryName || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Account No.</span>
                  <span className="text-sm font-semibold">{payoutDetails.accountNumber || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">IFSC Code</span>
                  <span className="text-sm font-semibold">{payoutDetails.ifscCode || "N/A"}</span>
                </div>
              </div>
            </div>

            {/* UPI & QR Card */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Smartphone className="w-5 h-5 text-purple-600" />
                <h2 className="font-bold text-gray-900">UPI & QR Code</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-gray-500 block mb-1">UPI ID</span>
                  <p className="text-sm font-semibold">{payoutDetails.upiId || "Not Set"}</p>
                </div>
                {payoutDetails.qrCode?.url && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">QR Code</span>
                    <img src={payoutDetails.qrCode.url} className="w-32 h-32 rounded border shadow-inner" alt="QR" />
                  </div>
                )}
              </div>
            </div>

            <p className="text-center text-xs text-gray-400">Last updated: {payoutDetails.lastUpdated || "Never"}</p>

            <button
              onClick={() => setIsEditMode(true)}
              className="w-full bg-black text-white py-4 rounded-xl font-bold shadow-lg hover:bg-gray-800 transition-all"
            >
              Update Details
            </button>
          </div>
        ) : (
          /* EDIT MODE */
          <form onSubmit={handleSubmit} className="space-y-5 pb-10">
            {/* Bank Info */}
            <div className="space-y-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Bank Information
              </p>

              <div className="space-y-3">
                <InputField
                  label="Beneficiary Name"
                  field="beneficiaryName"
                  value={formData.beneficiaryName}
                  error={errors.beneficiaryName}
                  touched={touched.beneficiaryName}
                  onChange={handleInputChange}
                  placeholder="As per bank records"
                />
                <InputField
                  label="Account Number"
                  field="accountNumber"
                  value={formData.accountNumber}
                  error={errors.accountNumber}
                  touched={touched.accountNumber}
                  onChange={handleInputChange}
                  type="text"
                  inputMode="numeric"
                />
                <InputField
                  label="Confirm Account Number"
                  field="confirmAccountNumber"
                  value={formData.confirmAccountNumber}
                  error={errors.confirmAccountNumber}
                  touched={touched.confirmAccountNumber}
                  onChange={handleInputChange}
                  type="text"
                  inputMode="numeric"
                />
                <InputField
                  label="IFSC Code"
                  field="ifscCode"
                  value={formData.ifscCode}
                  error={errors.ifscCode}
                  touched={touched.ifscCode}
                  onChange={handleInputChange}
                  placeholder="AAAA0XXXXXX"
                />
              </div>
            </div>

            {/* UPI Info */}
            <div className="space-y-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> UPI & QR (Optional)
              </p>

              <InputField
                label="UPI ID"
                field="upiId"
                value={formData.upiId}
                error={errors.upiId}
                touched={touched.upiId}
                onChange={handleInputChange}
                placeholder="username@bank"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">QR Code</label>
                {formData.qrCode?.url ? (
                  <div className="relative w-32 h-32">
                    <img src={formData.qrCode.url} className="w-full h-full object-cover rounded border" alt="QR" />
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, qrCode: null }))}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    {uploading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div> : <Upload className="w-6 h-6 text-gray-400" />}
                    <span className="text-xs text-gray-500">Click to upload UPI QR</span>
                  </button>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleQrUpload}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 sticky bottom-4">
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-4 rounded-xl font-bold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-2 bg-blue-600 text-white py-4 px-8 rounded-xl font-bold shadow-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Details"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function InputField({ label, field, value, error, touched, onChange, type = "text", inputMode = "text", placeholder = "" }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 border rounded-lg text-sm transition-all focus:ring-2 outline-none ${error && touched ? "border-red-500 focus:ring-red-100" : "border-gray-200 focus:border-blue-500 focus:ring-blue-100"
          }`}
      />
      {error && touched && (
        <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}