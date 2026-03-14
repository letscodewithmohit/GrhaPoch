import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, CheckCircle, Pencil, ArrowLeft, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from
  "@/components/ui/select";
import { uploadAPI, api, restaurantAPI } from "@/lib/api";
import { setAuthData as setRestaurantAuthData } from "@/lib/utils/auth";
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { determineStepToShow } from "../utils/onboardingUtils";
import { saveFilesToIDB, getFileFromIDB, clearIDB } from "../utils/onboardingStorage";
import { toast } from "sonner";

const cuisinesOptions = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Pizza",
  "Burgers",
  "Bakery",
  "Cafe"];


const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data";

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, step4, step5, currentStep) => {
  try {
    // Convert File objects to a serializable format (we'll store file names/paths if available)
    const serializableStep2 = {
      ...step2,
      menuImages: step2.menuImages.map((file) => {
        if (file instanceof File) {
          return { name: file.name, size: file.size, type: file.type };
        }
        return file;
      }),
      profileImage: step2.profileImage instanceof File ?
        { name: step2.profileImage.name, size: step2.profileImage.size, type: step2.profileImage.type } :
        step2.profileImage
    };

    const serializableStep3 = {
      ...step3,
      panImage: step3.panImage instanceof File ?
        { name: step3.panImage.name, size: step3.panImage.size, type: step3.panImage.type } :
        step3.panImage,
      gstImage: step3.gstImage instanceof File ?
        { name: step3.gstImage.name, size: step3.gstImage.size, type: step3.gstImage.type } :
        step3.gstImage,
      fssaiImage: step3.fssaiImage instanceof File ?
        { name: step3.fssaiImage.name, size: step3.fssaiImage.size, type: step3.fssaiImage.type } :
        step3.fssaiImage
    };

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      step4: step4 || {},
      step5: step5 || {},
      currentStep,
      timestamp: Date.now()
    };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(dataToSave));

    // Also persist actual File objects to IndexedDB
    const filesToPersist = {};

    // Step 2 Files - Always persist menuImages to IDB to reflect removals
    // If no File objects, save empty array so stale IDB entries are cleared
    const menuFileObjects = step2.menuImages.filter(f => f instanceof File);
    filesToPersist['menuImages'] = menuFileObjects.length > 0 ? menuFileObjects : null;

    filesToPersist['profileImage'] = step2.profileImage instanceof File ? step2.profileImage : null;

    // Step 3 Files
    filesToPersist['panImage'] = step3.panImage instanceof File ? step3.panImage : null;
    filesToPersist['gstImage'] = step3.gstImage instanceof File ? step3.gstImage : null;
    filesToPersist['fssaiImage'] = step3.fssaiImage instanceof File ? step3.fssaiImage : null;

    saveFilesToIDB(filesToPersist);
  } catch (error) {
    console.error("Failed to save onboarding data to localStorage/IDB:", error);
  }
};

const loadOnboardingFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load onboarding data from localStorage:", error);
  }
  return null;
};

const clearOnboardingFromLocalStorage = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    clearIDB();
  } catch (error) {
    console.error("Failed to clear onboarding data from localStorage/IDB:", error);
  }
};

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(":")) {
    return null;
  }
  const [hours, minutes] = timeString.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes);
};

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return "";
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

// Helper function to strip country code from phone number
const stripCountryCode = (phone) => {
  if (!phone) return "";
  // Strip everything but digits
  const clean = phone.toString().replace(/\D/g, "");
  // If it starts with 91 and is 12 digits (India), or starts with +91
  if (clean.length === 12 && clean.startsWith("91")) {
    return clean.slice(2);
  }
  // Fallback to last 10 digits if longer
  if (clean.length > 10) {
    return clean.slice(-10);
  }
  return clean;
};

// Validation Constants
const NAME_REGEX = /^[A-Za-z\s]+$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const isValidName = (name) => {
  const v = name?.trim();
  return v && v.length >= 3 && v.length <= 50 && NAME_REGEX.test(v);
};

const handleNameChange = (val) => {
  return val.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
};

// Memoized helper to prevent flickering when using URL.createObjectURL
const FilePreview = ({ file, className, alt = "Preview" }) => {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (file instanceof File) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (typeof file === 'string') {
      setPreviewUrl(file);
    } else if (file?.url) {
      setPreviewUrl(file.url);
    }
  }, [file]);

  if (!previewUrl) return null;

  return <img src={previewUrl} alt={alt} className={className} />;
};

function TimeSelector({ label, value, onChange, disabled = false, onBlur }) {
  const timeValue = value ? stringToTime(value) : null;

  const handleTimeChange = (newValue) => {
    if (newValue && !disabled) {
      const timeString = timeToString(newValue);
      onChange(timeString);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2">
        <Clock className={`w-4 h-4 ${disabled ? "text-gray-400" : (value ? "text-gray-800" : "text-gray-500")}`} />
        <span className={`text-xs font-semibold ${disabled ? "text-gray-500" : (value ? "text-gray-900" : "text-gray-700")}`}>{label}</span>
      </div>

      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <MobileTimePicker
          value={timeValue}
          onChange={handleTimeChange}
          disabled={disabled}
          slotProps={{
            textField: {
              fullWidth: true,
              onBlur: onBlur,
              placeholder: label === "Opening time" ? "e.g. 09:00 AM" : "e.g. 11:30 PM",
              size: "small",
              className: `flex items-center justify-between h-10 px-3 rounded-md border transition-all cursor-pointer ${disabled ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 hover:border-black/40 shadow-sm"
                } text-[13px] font-medium ${!value ? "text-gray-500" : "text-gray-900"}`
            }
          }}
        />
      </LocalizationProvider>
    </div>
  );
}

export default function RestaurantOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [hasLoadedLocal, setHasLoadedLocal] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [removingImages, setRemovingImages] = useState(new Set());
  const [removingProfile, setRemovingProfile] = useState(false);
  const bannerTimeoutRef = useRef(null);
  const filePickedRef = useRef(false);
  
  const handleExit = () => {
    navigate("/restaurant/login", { replace: true });
  };

  // Helper to clear file input native value (fixes "file name still showing" bug)
  const clearFileInput = (id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  };

  const handleFileClick = (fieldName, inputId) => {
    // Clear error instantly on click
    setFormErrors(prev => ({ ...prev, [fieldName]: null }));
    filePickedRef.current = false;

    // Watch for focus return to the window (which happens after file dialog closes)
    const onFocusBack = () => {
      window.removeEventListener('focus', onFocusBack);
      // Short delay to allow onChange to fire if a file was picked
      setTimeout(() => {
        if (!filePickedRef.current) {
          validateField(fieldName);
        }
      }, 500);
    };

    window.addEventListener('focus', onFocusBack);
  };

  // Sync validation errors to the main error summary
  useEffect(() => {
    const errorMessages = Object.values(formErrors).filter(Boolean);

    if (errorMessages.length === 0) {
      // If there are no more field errors, clear the top banner
      const isValidationError = error === "All fields are required" ||
        (error && (error.includes("required") ||
          error.includes("Invalid") ||
          error.includes("digits") ||
          error.includes("characters")));
      if (isValidationError) {
        setError("");
        if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      }
    } else if (errorMessages.length === 1 && error === "All fields are required") {
      // If we move from multiple errors back to one, update banner to the specific one
      setError(errorMessages[0]);
    }
  }, [formErrors, error]);

  // Validate a single field on blur and set error immediately
  const validateField = (fieldName, newValue = undefined) => {
    let error = null;
    switch (fieldName) {
      // Step 2
      case 'menuImages': {
        const imgs = newValue !== undefined ? newValue : step2.menuImages;
        if (!imgs || imgs.length === 0) error = "Menu images are required";
        break;
      }
      case 'profileImage': {
        const img = newValue !== undefined ? newValue : step2.profileImage;
        if (!img) error = "Profile photo is required";
        break;
      }
      case 'cuisines': {
        const c = newValue !== undefined ? newValue : step2.cuisines;
        if (!c || c.length === 0) error = "Select cuisines are required";
        else if (c.length > 3) error = "Maximum 3 cuisines allowed";
        break;
      }
      case 'openingTime': {
        const v = newValue !== undefined ? newValue : step2.openingTime;
        if (!v) error = "Opening time selection is required";
        break;
      }
      case 'closingTime': {
        const v = newValue !== undefined ? newValue : step2.closingTime;
        if (!v) error = "Closing time selection is required";
        break;
      }
      case 'openDays': {
        const v = newValue !== undefined ? newValue : step2.openDays;
        if (!v || v.length === 0) error = "Opening days selection is required";
        break;
      }
      case 'restaurantName': {
        const v = newValue !== undefined ? newValue : step1.restaurantName?.trim();
        if (!v) error = "Restaurant name is required";
        else if (v.length < 3 || v.length > 60) error = "Restaurant name must be between 3 and 60 characters.";
        else if (/^\d+$/.test(v)) error = "Restaurant name cannot contain only numbers.";
        else if (!/^[A-Za-z0-9\s&'-]+$/.test(v)) error = "Please enter a valid restaurant name.";
        break;
      }
      case 'ownerName': {
        const v = newValue !== undefined ? newValue : step1.ownerName?.trim();
        if (!v) error = "Full name is required";
        else if (!isValidName(v)) error = "Name must contain only letters (3???50 characters).";
        break;
      }
      case 'ownerEmail': {
        const v = newValue !== undefined ? newValue : step1.ownerEmail?.trim();
        if (!v) error = "Email address is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) error = "Please enter a valid email address.";
        break;
      }
      case 'ownerPhone': {
        const v = (newValue !== undefined ? newValue : step1.ownerPhone)?.trim()?.replace(/\D/g, '');
        if (!v) error = "Phone number is required";
        else if (v.length !== 10) error = "Phone number must be of 10 digits.";
        break;
      }
      case 'primaryContactNumber': {
        const v = (newValue !== undefined ? newValue : step1.primaryContactNumber)?.trim()?.replace(/\D/g, '');
        if (!v) error = "Primary contact number is required";
        else if (v.length !== 10) error = "Primary contact number must be of 10 digits.";
        break;
      }
      case 'area': {
        const v = newValue !== undefined ? newValue : step1.location?.area?.trim();
        if (!v) error = "Area is required";
        else if (v.length < 5) error = "Area or street must be at least 5 characters.";
        break;
      }
      case 'city': {
        const v = newValue !== undefined ? newValue : step1.location?.city?.trim();
        if (!v) error = "City is required";
        else if (!/^[A-Za-z\s]+$/.test(v) || v.length < 2) error = "Please enter a valid city name.";
        break;
      }
      case 'addressLine1': {
        const v = newValue !== undefined ? newValue : step1.location?.addressLine1?.trim();
        if (!v) error = "Building number is required";
        break;
      }
      case 'addressLine2': {
        const v = newValue !== undefined ? newValue : step1.location?.addressLine2?.trim();
        if (v && v.length < 2) error = "Floor/tower must be at least 2 characters.";
        break;
      }
      case 'landmark': {
        const v = newValue !== undefined ? newValue : step1.location?.landmark?.trim();
        if (v && v.length < 3) error = "Landmark must be at least 3 characters.";
        break;
      }
      case 'panNumber': {
        const v = newValue !== undefined ? newValue : step3.panNumber?.trim();
        if (!v) error = "PAN number is required";
        else if (v.length < 10) error = "PAN number must be exactly 10 characters (Format: AAAAA9999A)";
        else if (!PAN_REGEX.test(v)) error = "Invalid PAN format. Example: ABCDE1234F";
        break;
      }
      case 'nameOnPan': {
        const v = newValue !== undefined ? newValue : step3.nameOnPan?.trim();
        if (!v) error = "Name on PAN is required";
        else if (!isValidName(v)) error = "Name must contain only letters (3???50 characters).";
        break;
      }
      case 'panImage': {
        const img = newValue !== undefined ? newValue : step3.panImage;
        if (!img) error = "PAN image is required";
        break;
      }
      case 'fssaiNumber': {
        const v = newValue !== undefined ? newValue : step3.fssaiNumber?.trim();
        if (!v) error = "FSSAI number is required";
        else if (v.length !== 14 || !/^\d+$/.test(v)) error = "Invalid FSSAI number. It must contain exactly 14 digits.";
        break;
      }
      case 'fssaiExpiry': {
        const d = newValue !== undefined ? newValue : step3.fssaiExpiry;
        if (!d) error = "FSSAI expiry is required";
        break;
      }
      case 'fssaiImage': {
        const img = newValue !== undefined ? newValue : step3.fssaiImage;
        if (!img) error = "FSSAI image is required";
        break;
      }
      case 'gstNumber': {
        const v = newValue !== undefined ? newValue : step3.gstNumber?.trim();
        if (step3.gstRegistered) {
          if (!v) error = "GST number is required";
          else if (v.length !== 15 || !GST_REGEX.test(v)) error = "Invalid GST number. Example: 22ABCDE1234F1Z5";
        }
        break;
      }
      case 'gstLegalName': {
        const v = newValue !== undefined ? newValue : step3.gstLegalName?.trim();
        if (step3.gstRegistered) {
          if (!v) error = "GST legal name is required";
          else if (!isValidName(v)) error = "Legal name must contain only letters.";
        }
        break;
      }
      case 'gstAddress': {
        const v = newValue !== undefined ? newValue : step3.gstAddress?.trim();
        if (step3.gstRegistered && !v) error = "GST address is required";
        break;
      }
      case 'gstImage': {
        const img = newValue !== undefined ? newValue : step3.gstImage;
        if (step3.gstRegistered && !img) error = "GST image is required";
        break;
      }
      case 'accountNumber': {
        const v = newValue !== undefined ? newValue : step3.accountNumber?.trim();
        if (!v) error = "Account number is required";
        else if (v.length < 9 || v.length > 18 || !/^\d+$/.test(v)) error = "Invalid account number. Only numbers are allowed.";
        break;
      }
      case 'confirmAccountNumber': {
        const v = newValue !== undefined ? newValue : step3.confirmAccountNumber?.trim();
        if (!v) error = "Account number confirmation is required";
        else if (v !== (fieldName === 'accountNumber' ? (newValue || step3.accountNumber) : step3.accountNumber)) {
          // Special check if we are updating the main account number and confirm doesn't match
          if (fieldName === 'accountNumber') {
            if (step3.confirmAccountNumber && v !== step3.confirmAccountNumber) {
              // We typically only show match error on confirm field blur
            }
          } else {
            error = "Account numbers do not match. Please re-enter correctly.";
          }
        }
        break;
      }
      case 'ifscCode': {
        const v = newValue !== undefined ? newValue : step3.ifscCode?.trim();
        if (!v) error = "IFSC code is required";
        else if (v.length !== 11 || !IFSC_REGEX.test(v)) error = "Invalid IFSC code. Example: SBIN0001234";
        break;
      }
      case 'accountHolderName': {
        const v = newValue !== undefined ? newValue : step3.accountHolderName?.trim();
        if (!v) error = "Account holder name is required";
        else if (!isValidName(v)) error = "Name must contain only letters (3???50 characters).";
        break;
      }
      case 'accountType': {
        const v = newValue !== undefined ? newValue : step3.accountType;
        if (!v) error = "Account type is required";
        break;
      }
      // Step 4
      case 'estimatedDeliveryTime': {
        const v = newValue !== undefined ? newValue : step4.estimatedDeliveryTime?.trim();
        if (!v) error = "Delivery time is required";
        break;
      }
      case 'featuredDish': {
        const v = newValue !== undefined ? newValue : step4.featuredDish?.trim();
        if (!v) error = "Featured dish is required";
        break;
      }
      case 'featuredPrice': {
        const rawV = newValue !== undefined ? newValue : step4.featuredPrice;
        const v = parseFloat(rawV);
        if (!rawV || isNaN(v) || v <= 0) error = "Featured price is required";
        break;
      }
      case 'offer': {
        const v = newValue !== undefined ? newValue : step4.offer?.trim();
        if (!v) error = "Pricing offer is required";
        break;
      }
      // Step 5
      case 'businessModel': {
        const v = newValue !== undefined ? newValue : step5.businessModel;
        if (!v) error = "Business model is required";
        break;
      }
      default: break;
    }
    setTouchedFields(prev => ({ ...prev, [fieldName]: true }));
    setFormErrors(prev => ({ ...prev, [fieldName]: error }));
  };

  const [isProspect, setIsProspect] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const [step1, setStep1] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    location: {
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      landmark: ""
    }
  });

  // Load pending registration data for prospects
  useEffect(() => {
    const pending = localStorage.getItem("pendingRestaurantRegistration");
    const token = localStorage.getItem("restaurant_accessToken");

    console.log("Onboarding Prospect Check - pending:", !!pending, "token:", !!token);

    if (pending) {
      const data = JSON.parse(pending);
      console.log("Prospect identified - name:", data.name);

      // Clear old tokens to prevent interference
      if (token) {
        console.warn("Clearing old session token");
        localStorage.removeItem("restaurant_accessToken");
        localStorage.removeItem("restaurant_authenticated");
        localStorage.removeItem("restaurant_user");
      }

      setIsProspect(true);
      setPendingData(data);

      // Use functional update to merge with existing step1 values (from local storage)
      // but favor pending registration values if those are empty.
      setStep1(prev => ({
        ...prev,
        // Prioritize data.name from pending registration to ensure latest input is used
        restaurantName: data.name || prev.restaurantName || "",
        ownerPhone: stripCountryCode(prev.ownerPhone || data.phone || ""),
        ownerEmail: prev.ownerEmail || data.email || "",
        primaryContactNumber: stripCountryCode(prev.primaryContactNumber || data.phone || "")
      }));
    } else if (!token) {
      console.log("No auth and no prospect data - redirecting to login");
      navigate("/restaurant/login", { replace: true });
    }
  }, [navigate]);

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: "",
    closingTime: "",
    openDays: []
  });

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: ""
  });

  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "",
    featuredDish: "",
    featuredPrice: "",
    offer: ""
  });

  const [step5, setStep5] = useState({
    businessModel: ""
  });

  const fetchCalledRef = useRef(false);

  // Load from localStorage on mount and check URL parameter
  useEffect(() => {
    const initializeData = async () => {
      // Check if step is specified in URL (from OTP login redirect)
      const stepParam = searchParams.get("step");
      const localData = loadOnboardingFromLocalStorage();

      if (stepParam) {
        const stepNum = parseInt(stepParam, 10);
        if (stepNum >= 1 && stepNum <= 5) {
          setStep(stepNum);
        }
      } else if (localData?.currentStep) {
        setStep(localData.currentStep);
      }

      if (localData && !hasLoadedLocal) {
        // 1. Apply Step 1-5 text data first...
        if (localData.step1) {
          setStep1(prev => ({
            ...prev,
            // Use nullish coalescing (??) so that intentionally cleared fields (empty "") are respected
            restaurantName: localData.step1.restaurantName ?? prev.restaurantName ?? JSON.parse(localStorage.getItem("restaurant_user") || "{}").name ?? "",
            ownerName: localData.step1.ownerName ?? prev.ownerName ?? "",
            ownerEmail: localData.step1.ownerEmail ?? prev.ownerEmail ?? "",
            ownerPhone: stripCountryCode(localData.step1.ownerPhone ?? prev.ownerPhone ?? ""),
            primaryContactNumber: stripCountryCode(localData.step1.primaryContactNumber ?? prev.primaryContactNumber ?? ""),
            location: {
              addressLine1: localData.step1.location?.addressLine1 ?? prev.location?.addressLine1 ?? "",
              addressLine2: localData.step1.location?.addressLine2 ?? prev.location?.addressLine2 ?? "",
              area: localData.step1.location?.area ?? prev.location?.area ?? "",
              city: localData.step1.location?.city ?? prev.location?.city ?? "",
              landmark: localData.step1.location?.landmark ?? prev.location?.landmark ?? ""
            }
          }));
        }
        if (localData.step2) {
          const sanitizeTime = (val) => (val === "null" || val === "undefined" || !val) ? "" : val;
          setStep2(prev => ({
            ...prev,
            menuImages: localData.step2.menuImages?.filter(f => !(f?.name && f?.size && f?.type)) ?? prev.menuImages ?? [],
            profileImage: !(localData.step2.profileImage?.name && localData.step2.profileImage?.size) ? (localData.step2.profileImage ?? prev.profileImage) : prev.profileImage,
            cuisines: localData.step2.cuisines ?? prev.cuisines ?? [],
            openingTime: sanitizeTime(localData.step2.openingTime ?? prev.openingTime),
            closingTime: sanitizeTime(localData.step2.closingTime ?? prev.closingTime),
            openDays: localData.step2.openDays ?? prev.openDays ?? []
          }));
        }
        if (localData.step3) {
          setStep3(prev => ({
            ...prev,
            panNumber: localData.step3.panNumber ?? prev.panNumber ?? "",
            nameOnPan: localData.step3.nameOnPan ?? prev.nameOnPan ?? "",
            panImage: !(localData.step3.panImage?.name && localData.step3.panImage?.size) ? (localData.step3.panImage ?? prev.panImage) : prev.panImage,
            gstRegistered: localData.step3.gstRegistered !== undefined ? localData.step3.gstRegistered : (prev.gstRegistered ?? false),
            gstNumber: localData.step3.gstNumber ?? prev.gstNumber ?? "",
            gstLegalName: localData.step3.gstLegalName ?? prev.gstLegalName ?? "",
            gstAddress: localData.step3.gstAddress ?? prev.gstAddress ?? "",
            gstImage: !(localData.step3.gstImage?.name && localData.step3.gstImage?.size) ? (localData.step3.gstImage ?? prev.gstImage) : prev.gstImage,
            fssaiNumber: localData.step3.fssaiNumber ?? prev.fssaiNumber ?? "",
            fssaiExpiry: localData.step3.fssaiExpiry ?? prev.fssaiExpiry ?? "",
            fssaiImage: !(localData.step3.fssaiImage?.name && localData.step3.fssaiImage?.size) ? (localData.step3.fssaiImage ?? prev.fssaiImage) : prev.fssaiImage,
            accountNumber: localData.step3.accountNumber ?? prev.accountNumber ?? "",
            confirmAccountNumber: localData.step3.confirmAccountNumber ?? prev.confirmAccountNumber ?? "",
            ifscCode: localData.step3.ifscCode ?? prev.ifscCode ?? "",
            accountHolderName: localData.step3.accountHolderName ?? prev.accountHolderName ?? "",
            accountType: localData.step3.accountType ?? prev.accountType ?? ""
          }));
        }
        if (localData.step4) {
          setStep4(prev => ({
            ...prev,
            estimatedDeliveryTime: localData.step4.estimatedDeliveryTime ?? prev.estimatedDeliveryTime ?? "",
            featuredDish: localData.step4.featuredDish ?? prev.featuredDish ?? "",
            featuredPrice: localData.step4.featuredPrice ?? prev.featuredPrice ?? "",
            offer: localData.step4.offer ?? prev.offer ?? ""
          }));
        }
        if (localData.step5) {
          setStep5(prev => ({
            ...prev,
            businessModel: localData.step5.businessModel || prev.businessModel || ""
          }));
        }

        // 2. Await file hydration from IndexedDB
        try {
          // Load Step 2 Files
          const idbMenuImages = await getFileFromIDB('menuImages');
          const idbProfileImage = await getFileFromIDB('profileImage');

          if (idbMenuImages || idbProfileImage) {
            setStep2(prev => ({
              ...prev,
              // Replace (not append) to avoid duplicating images on refresh.
              // IDB is the authoritative source for File objects.
              menuImages: idbMenuImages ? idbMenuImages : prev.menuImages,
              profileImage: idbProfileImage || prev.profileImage
            }));
          }

          // Load Step 3 Files
          const idbPanImage = await getFileFromIDB('panImage');
          const idbGstImage = await getFileFromIDB('gstImage');
          const idbFssaiImage = await getFileFromIDB('fssaiImage');

          if (idbPanImage || idbGstImage || idbFssaiImage) {
            setStep3(prev => ({
              ...prev,
              panImage: idbPanImage || prev.panImage,
              gstImage: idbGstImage || prev.gstImage,
              fssaiImage: idbFssaiImage || prev.fssaiImage
            }));
          }
        } catch (err) {
          console.error("IDB Hydration Error:", err);
        }

        setHasLoadedLocal(true);
      } else if (!localData) {
        setHasLoadedLocal(true);
      }
    };

    initializeData();
  }, []);

  // Ensure closing time is locked if opening time is empty
  useEffect(() => {
    if (!step2.openingTime && step2.closingTime) {
      setStep2(prev => ({ ...prev, closingTime: "" }));
    }
  }, [step2.openingTime]);

  // Synchronize step state with URL search parameters
  useEffect(() => {
    const currentStepInUrl = parseInt(searchParams.get("step"), 10);
    if (step && currentStepInUrl !== step) {
      // Create new search params to avoid mutating original
      const newParams = new URLSearchParams(searchParams);
      newParams.set("step", step.toString());
      navigate(`?${newParams.toString()}`, { replace: true });
    }
  }, [step, navigate]);

  // Save to localStorage whenever step data changes
  useEffect(() => {
    if (hasLoadedLocal) {
      saveOnboardingToLocalStorage(step1, step2, step3, step4, step5, step);
    }
  }, [step1, step2, step3, step4, step5, step, hasLoadedLocal]);

  useEffect(() => {
    const fetchData = async () => {
      // Don't fetch if already called or if this is a new prospect (no account yet)
      const pending = localStorage.getItem("pendingRestaurantRegistration");
      if (fetchCalledRef.current || (pending && !localStorage.getItem("restaurant_accessToken"))) return;

      fetchCalledRef.current = true;
      try {
        setLoading(true);
        const res = await api.get("/restaurant/onboarding");
        const data = res?.data?.data?.onboarding;
        if (data) {
          if (data.step1) {
            setStep1((prev) => ({
              ...prev,
              // Use ?? to treat an empty string as a deliberate clear ??? never overwrite with server data
              restaurantName: prev.restaurantName !== undefined ? prev.restaurantName : (data.step1.restaurantName || JSON.parse(localStorage.getItem("restaurant_user") || "{}").name || ""),
              ownerName: prev.ownerName !== undefined ? prev.ownerName : (data.step1.ownerName || ""),
              ownerEmail: prev.ownerEmail !== undefined ? prev.ownerEmail : (data.step1.ownerEmail || ""),
              ownerPhone: stripCountryCode(prev.ownerPhone !== undefined ? prev.ownerPhone : (data.step1.ownerPhone || "")),
              primaryContactNumber: stripCountryCode(prev.primaryContactNumber !== undefined ? prev.primaryContactNumber : (data.step1.primaryContactNumber || "")),
              location: {
                addressLine1: prev.location.addressLine1 !== undefined ? prev.location.addressLine1 : (data.step1.location?.addressLine1 || ""),
                addressLine2: prev.location.addressLine2 !== undefined ? prev.location.addressLine2 : (data.step1.location?.addressLine2 || ""),
                area: prev.location.area !== undefined ? prev.location.area : (data.step1.location?.area || ""),
                city: prev.location.city !== undefined ? prev.location.city : (data.step1.location?.city || ""),
                landmark: prev.location.landmark !== undefined ? prev.location.landmark : (data.step1.location?.landmark || "")
              }
            }));
          }
          if (data.step2) {
            setStep2(prev => ({
              ...prev,
              // Favor local hydrated images over server URLs if they exist
              menuImages: prev.menuImages.length > 0 ? prev.menuImages : (data.step2.menuImageUrls || []),
              profileImage: prev.profileImage || data.step2.profileImageUrl || null,
              cuisines: prev.cuisines.length > 0 ? prev.cuisines : (data.step2.cuisines || []),
              openingTime: prev.openingTime || data.step2.deliveryTimings?.openingTime || "",
              closingTime: prev.closingTime || data.step2.deliveryTimings?.closingTime || "",
              openDays: prev.openDays.length > 0 ? prev.openDays : (data.step2.openDays || [])
            }));
          }
          if (data.step3) {
            setStep3(prev => ({
              ...prev,
              panNumber: prev.panNumber || data.step3.pan?.panNumber || "",
              nameOnPan: prev.nameOnPan || data.step3.pan?.nameOnPan || "",
              panImage: prev.panImage || null, // Priority to local hydrated image
              gstRegistered: prev.gstRegistered !== undefined ? prev.gstRegistered : (data.step3.gst?.isRegistered || false),
              gstNumber: prev.gstNumber || data.step3.gst?.gstNumber || "",
              gstLegalName: prev.gstLegalName || data.step3.gst?.legalName || "",
              gstAddress: prev.gstAddress || data.step3.gst?.address || "",
              gstImage: prev.gstImage || null,
              fssaiNumber: prev.fssaiNumber || data.step3.fssai?.registrationNumber || "",
              fssaiExpiry: prev.fssaiExpiry || (data.step3.fssai?.expiryDate ? data.step3.fssai.expiryDate.slice(0, 10) : ""),
              fssaiImage: prev.fssaiImage || null,
              accountNumber: prev.accountNumber || data.step3.bank?.accountNumber || "",
              confirmAccountNumber: prev.confirmAccountNumber || data.step3.bank?.accountNumber || "",
              ifscCode: prev.ifscCode || data.step3.bank?.ifscCode || "",
              accountHolderName: prev.accountHolderName || data.step3.bank?.accountHolderName || "",
              accountType: prev.accountType || data.step3.bank?.accountType || ""
            }));
          }

          if (data.step4) {
            setStep4(prev => ({
              ...prev,
              estimatedDeliveryTime: prev.estimatedDeliveryTime || data.step4.estimatedDeliveryTime || "",
              featuredDish: prev.featuredDish || data.step4.featuredDish || "",
              featuredPrice: prev.featuredPrice || data.step4.featuredPrice || "",
              offer: prev.offer || data.step4.offer || ""
            }));
          }

          if (data.businessModel) {
            setStep5(prev => ({
              ...prev,
              businessModel: prev.businessModel || data.businessModel || "Commission Base"
            }));
          }

          // Determine which step to show based on completeness
          const stepToShow = determineStepToShow(data);
          // Always respect the URL step param (use window.location to avoid stale closure)
          const currentUrlStep = new URLSearchParams(window.location.search).get("step");
          if (!currentUrlStep) {
            setStep(stepToShow || 1);
          }
        }
      } catch (err) {
        // Handle error gracefully - if it's a 401 (unauthorized), the user might need to login again
        // Otherwise, just continue with empty onboarding data
        if (err?.response?.status === 401) {
          console.error("Authentication error fetching onboarding:", err);
          // Don't show error to user, they can still fill the form
          // The error might be because restaurant is not yet active (pending verification)
        } else {
          console.error("Error fetching onboarding data:", err);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder });
      const d = res?.data?.data || res?.data;
      return { url: d.url, publicId: d.publicId };
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image";
      console.error("Upload error:", errorMsg, err);
      throw new Error(`Image upload failed: ${errorMsg}`);
    }
  };

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = {};

    // Restaurant Name
    const resName = step1.restaurantName?.trim();
    if (!resName) {
      errors.restaurantName = "Restaurant name is required";
    } else if (resName.length < 3 || resName.length > 60) {
      errors.restaurantName = "Restaurant name must be between 3 and 60 characters.";
    } else if (/^\d+$/.test(resName)) {
      errors.restaurantName = "Restaurant name cannot contain only numbers.";
    } else if (!/^[A-Za-z0-9\s&'-]+$/.test(resName)) {
      errors.restaurantName = "Please enter a valid restaurant name.";
    }

    // Owner Full Name
    const ownerName = step1.ownerName?.trim();
    if (!ownerName) {
      errors.ownerName = "Full name is required";
    } else if (!isValidName(ownerName)) {
      errors.ownerName = "Name must contain only letters (3???50 characters).";
    }

    // Email Address
    const email = step1.ownerEmail?.trim();
    if (!email) {
      errors.ownerEmail = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.ownerEmail = "Please enter a valid email address.";
    }

    // Phone Number
    const phone = step1.ownerPhone?.trim()?.replace(/\D/g, '');
    if (!phone) {
      errors.ownerPhone = "Phone number is required";
    } else if (phone.length !== 10) {
      errors.ownerPhone = "Phone number must be of 10 digits.";
    }

    // Primary Contact Number
    const contact = step1.primaryContactNumber?.trim()?.replace(/\D/g, '');
    if (!contact) {
      errors.primaryContactNumber = "Primary contact number is required";
    } else if (contact.length !== 10) {
      errors.primaryContactNumber = "Primary contact number must be of 10 digits.";
    }

    // Area
    const area = step1.location?.area?.trim();
    if (!area) {
      errors.area = "Area is required";
    } else if (area.length < 5) {
      errors.area = "Area or street must be at least 5 characters.";
    }

    // City
    const city = step1.location?.city?.trim();
    if (!city) {
      errors.city = "City is required";
    } else if (!/^[A-Za-z\s]+$/.test(city)) {
      errors.city = "Please enter a valid city name.";
    } else if (city.length < 2) {
      errors.city = "City name must be at least 2 characters.";
    }

    // Building Number (addressLine1)
    const building = step1.location?.addressLine1?.trim();
    if (!building) {
      errors.addressLine1 = "Building number is required";
    } else if (building.length < 1) {
      errors.addressLine1 = "Building number is required";
    }

    // Floor / Landmark (addressLine2) - Optional but min 2 if filled
    const floor = step1.location?.addressLine2?.trim();
    if (floor && floor.length < 2) {
      errors.addressLine2 = "Floor/tower must be at least 2 characters.";
    }

    // Building / Complex Name (landmark) - Optional but min 3 if filled
    const landmark = step1.location?.landmark?.trim();
    if (landmark && landmark.length < 3) {
      errors.landmark = "Landmark must be at least 3 characters.";
    }

    return errors;
  };

  const validateStep2 = () => {
    const errors = {};
    const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 3 * 1024 * 1024; // 3MB

    // Menu Images
    const menuImages = step2.menuImages || [];
    if (menuImages.length === 0) {
      errors.menuImages = "Menu image is required";
    } else if (menuImages.length > 10) {
      errors.menuImages = "Maximum 10 images allowed.";
    } else {
      for (const img of menuImages) {
        if (img instanceof File) {
          if (!allowedFormats.includes(img.type)) {
            errors.menuImages = "Images must be in JPG, PNG, or WEBP format.";
            break;
          }
          if (img.size > maxSize) {
            errors.menuImages = "Maximum size is 3MB per image.";
            break;
          }
        }
      }
    }

    // Profile Image
    const profileImg = step2.profileImage;
    if (!profileImg) {
      errors.profileImage = "Profile photo is required";
    } else if (profileImg instanceof File) {
      if (!allowedFormats.includes(profileImg.type)) {
        errors.profileImage = "Images must be in JPG, PNG, or WEBP format.";
      } else if (profileImg.size > maxSize) {
        errors.profileImage = "Maximum size is 3MB.";
      }
    }

    // Cuisines
    if (!step2.cuisines || step2.cuisines.length === 0) {
      errors.cuisines = "Cuisine selection is required";
    } else if (step2.cuisines.length > 3) {
      errors.cuisines = "Maximum 3 cuisines allowed.";
    }

    // Timings
    if (!step2.openingTime) {
      errors.openingTime = "Opening time is required";
    }
    if (!step2.closingTime) {
      errors.closingTime = "Closing time is required";
    } else if (step2.openingTime && step2.closingTime) {
      const open = stringToTime(step2.openingTime);
      const close = stringToTime(step2.closingTime);
      if (close <= open) {
        errors.closingTime = "Closing time must be later than opening time.";
      }
    }

    // Open Days
    if (!step2.openDays || step2.openDays.length === 0) {
      errors.openDays = "Opening days selection is required";
    }

    return errors;
  };

  const validateStep4 = () => {
    const errors = {};
    if (!step4.estimatedDeliveryTime || !step4.estimatedDeliveryTime.trim()) {
      errors.estimatedDeliveryTime = "Delivery time is required";
    }
    if (!step4.featuredDish || !step4.featuredDish.trim()) {
      errors.featuredDish = "Featured dish is required";
    }
    if (!step4.featuredPrice || step4.featuredPrice === "" || isNaN(parseFloat(step4.featuredPrice)) || parseFloat(step4.featuredPrice) <= 0) {
      errors.featuredPrice = "Featured price is required";
    }
    if (!step4.offer || !step4.offer.trim()) {
      errors.offer = "Pricing offer is required";
    }
    return errors;
  };

  const validateStep5 = () => {
    const errors = {};
    if (!step5.businessModel) {
      errors.businessModel = "Business model is required";
    }
    return errors;
  };

  const validateStep3 = () => {
    const errors = {};

    // PAN Number
    const pan = step3.panNumber?.trim();
    if (!pan) {
      errors.panNumber = "PAN number is required";
    } else if (pan.length < 10) {
      errors.panNumber = "PAN number must be exactly 10 characters (Format: AAAAA9999A)";
    } else if (!PAN_REGEX.test(pan)) {
      errors.panNumber = "Invalid PAN format. Example: ABCDE1234F";
    }

    // Name on PAN
    if (!step3.nameOnPan?.trim()) {
      errors.nameOnPan = "Name on PAN is required";
    } else if (!isValidName(step3.nameOnPan)) {
      errors.nameOnPan = "Name must contain only letters (3???50 characters).";
    }
    if (!step3.panImage) {
      errors.panImage = "PAN image is required";
    }

    // FSSAI
    const fssai = step3.fssaiNumber?.trim();
    if (!fssai) {
      errors.fssaiNumber = "FSSAI number is required";
    } else if (fssai.length !== 14 || !/^\d+$/.test(fssai)) {
      errors.fssaiNumber = "Invalid FSSAI number. It must contain exactly 14 digits.";
    }
    if (!step3.fssaiExpiry?.trim()) {
      errors.fssaiExpiry = "FSSAI expiry is required";
    }
    // Validate FSSAI image
    if (!step3.fssaiImage) {
      errors.fssaiImage = "FSSAI image is required";
    }

    // Validate GST details if GST registered
    if (step3.gstRegistered) {
      const gst = step3.gstNumber?.trim();
      if (!gst) {
        errors.gstNumber = "GST number is required";
      } else if (gst.length !== 15 || !GST_REGEX.test(gst)) {
        errors.gstNumber = "Invalid GST number. Example: 22ABCDE1234F1Z5";
      }

      if (!step3.gstLegalName?.trim()) {
        errors.gstLegalName = "GST legal name is required";
      } else if (!isValidName(step3.gstLegalName)) {
        errors.gstLegalName = "Legal name must contain only letters.";
      }
      if (!step3.gstAddress?.trim()) {
        errors.gstAddress = "GST address is required";
      }
      // Validate GST image if GST registered
      if (!step3.gstImage) {
        errors.gstImage = "GST image is required";
      }
    }

    // Bank Account
    const acc = step3.accountNumber?.trim();
    if (!acc) {
      errors.accountNumber = "Account number is required";
    } else if (acc.length < 9 || acc.length > 18 || !/^\d+$/.test(acc)) {
      errors.accountNumber = "Invalid account number. Only numbers are allowed.";
    }

    if (!step3.confirmAccountNumber?.trim()) {
      errors.confirmAccountNumber = "Account number confirmation is required";
    } else if (step3.accountNumber !== step3.confirmAccountNumber) {
      errors.confirmAccountNumber = "Account numbers do not match. Please re-enter correctly.";
    }
    if (!step3.ifscCode?.trim()) {
      errors.ifscCode = "IFSC code is required";
    } else if (step3.ifscCode.length !== 11 || !IFSC_REGEX.test(step3.ifscCode)) {
      errors.ifscCode = "Invalid IFSC code. Example: SBIN0001234";
    }

    if (!step3.accountHolderName?.trim()) {
      errors.accountHolderName = "Account holder name is required";
    } else if (!isValidName(step3.accountHolderName)) {
      errors.accountHolderName = "Name must contain only letters (3???50 characters).";
    }
    if (!step3.accountType?.trim()) {
      errors.accountType = "Account type is required";
    }

    return errors;
  };

  // Fill dummy data for testing (development mode only)
  const fillDummyData = () => {
    if (step === 1) {
      setStep1({
        restaurantName: "The Grill House",
        ownerName: "John Smith",
        ownerEmail: "john.smith@example.com",
        ownerPhone: "9876543210",
        primaryContactNumber: "9123456780",
        location: {
          addressLine1: "Flat 402, Sea View",
          addressLine2: "A Wing, 4th Floor",
          area: "Bandra West",
          city: "Mumbai",
          landmark: "Opposite Taj Hotel"
        }
      });
      toast.success("Step 1 filled with dummy data", { duration: 2000 });
    } else if (step === 2) {
      setStep2({
        menuImages: [{ url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80" }],
        profileImage: { url: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80" },
        cuisines: ["North Indian", "Chinese"],
        openingTime: "09:00",
        closingTime: "23:00",
        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      });
      toast.success("Step 2 filled with dummy data", { duration: 2000 });
    } else if (step === 3) {
      // Calculate expiry date 1 year from now
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      const expiryDateString = expiryDate.toISOString().split("T")[0];

      setStep3({
        panNumber: "ABCDE1234F",
        nameOnPan: "John Doe",
        panImage: null,
        gstRegistered: true,
        gstNumber: "27ABCDE1234F1Z5",
        gstLegalName: "Test Restaurant Private Limited",
        gstAddress: "123 Main Street, Mumbai, Maharashtra 400001",
        gstImage: null,
        fssaiNumber: "12345678901234",
        fssaiExpiry: expiryDateString,
        fssaiImage: null,
        accountNumber: "1234567890123",
        confirmAccountNumber: "1234567890123",
        ifscCode: "HDFC0001234",
        accountHolderName: "John Doe",
        accountType: "savings"
      });
      toast.success("Step 3 filled with dummy data", { duration: 2000 });
    } else if (step === 4) {
      setStep4({
        estimatedDeliveryTime: "25-30 mins",
        featuredDish: "Butter Chicken Special",
        featuredPrice: "249",
        offer: "Flat ₹50 OFF above ₹199"
      });
      toast.success("Step 4 filled with dummy data", { duration: 2000 });
    } else if (step === 5) {
      setStep5({
        businessModel: "Commission Base"
      });
      toast.success("Step 5 filled with dummy data", { duration: 2000 });
    }
  };

  const handleNext = async () => {
    setError("");

    // Validate current step before proceeding
    let validationErrors = [];
    if (step === 1) {
      validationErrors = validateStep1();
    } else if (step === 2) {
      validationErrors = validateStep2();
    } else if (step === 3) {
      validationErrors = validateStep3();
    } else if (step === 4) {
      validationErrors = validateStep4();
    } else if (step === 5) {
      validationErrors = validateStep5();
    }

    if (validationErrors.length > 0) {
      // Show error toast for each validation error
      validationErrors.forEach((error, index) => {
        setTimeout(() => {
          toast.error(error, {
            duration: 4000
          });
        }, index * 100);
      });

      return;
    }

    setSaving(true);
    try {
      if (step === 1) {
        const payload = {
          step1,
          completedSteps: 1
        };
        if (!isProspect) {
          // REMOVED: Intermediate API call to save Step 1
          // await api.put("/restaurant/onboarding", payload);

          // We still update the main restaurant profile name locally if desired, 
          // but we'll sync everything at the end as per user requirement.
        }
        setStep(2);
      } else if (step === 2) {
        if (isProspect) {
          setStep(3);
          return;
        }
        const menuUploads = [];
        // Upload menu images if they are File objects
        for (const file of step2.menuImages.filter((f) => f instanceof File)) {
          try {
            const uploaded = await handleUpload(file, "appzeto/restaurant/menu");
            // Verify upload was successful and has valid URL
            if (!uploaded || !uploaded.url) {
              throw new Error(`Failed to upload menu image: ${file.name}`);
            }
            menuUploads.push(uploaded);
          } catch (uploadError) {
            console.error('Menu image upload error:', uploadError);
            throw new Error(`Failed to upload menu image: ${uploadError.message}`);
          }
        }
        // If menuImages already have URLs (from previous save), include them
        const existingMenuUrls = step2.menuImages.filter((img) => !(img instanceof File) && (img?.url || typeof img === 'string' && img.startsWith('http')));
        const allMenuUrls = [...existingMenuUrls, ...menuUploads];

        // Verify we have at least one menu image
        if (allMenuUrls.length === 0) {
          throw new Error('At least one menu image must be uploaded');
        }

        // Upload profile image if it's a File object
        let profileUpload = null;
        if (step2.profileImage instanceof File) {
          try {
            profileUpload = await handleUpload(step2.profileImage, "appzeto/restaurant/profile");
            // Verify upload was successful and has valid URL
            if (!profileUpload || !profileUpload.url) {
              throw new Error('Failed to upload profile image');
            }
          } catch (uploadError) {
            console.error('Profile image upload error:', uploadError);
            throw new Error(`Failed to upload profile image: ${uploadError.message}`);
          }
        } else if (step2.profileImage?.url) {
          // If profileImage already has a URL (from previous save), use it
          profileUpload = step2.profileImage;
        } else if (typeof step2.profileImage === 'string' && step2.profileImage.startsWith('http')) {
          // If it's a direct URL string
          profileUpload = { url: step2.profileImage };
        }

        // Verify profile image is present
        if (!profileUpload || !profileUpload.url) {
          throw new Error('Profile image must be uploaded');
        }

        const payload = {
          step2: {
            menuImageUrls: allMenuUrls.length > 0 ? allMenuUrls : [],
            profileImageUrl: profileUpload,
            cuisines: step2.cuisines || [],
            deliveryTimings: {
              openingTime: step2.openingTime || "",
              closingTime: step2.closingTime || ""
            },
            openDays: step2.openDays || []
          },
          completedSteps: 2
        };

        // Update local state with the uploaded URLs
        setStep2(prev => ({
          ...prev,
          menuImages: allMenuUrls,
          profileImage: profileUpload
        }));

        if (!isProspect) {
          // REMOVED: Intermediate API call to save Step 2
          // const response = await api.put("/restaurant/onboarding", payload);
          // For now, we just skip the response check since we're not calling the API
        }

        // Only proceed to step 3
        setStep(3);
      } else if (step === 3) {
        if (isProspect) {
          setStep(4);
          return;
        }
        // Upload PAN image if it's a File object
        let panImageUpload = null;
        if (step3.panImage instanceof File) {
          try {
            panImageUpload = await handleUpload(step3.panImage, "appzeto/restaurant/pan");
            // Verify upload was successful and has valid URL
            if (!panImageUpload || !panImageUpload.url) {
              throw new Error('Failed to upload PAN image');
            }
          } catch (uploadError) {
            console.error('PAN image upload error:', uploadError);
            throw new Error(`Failed to upload PAN image: ${uploadError.message}`);
          }
        } else if (step3.panImage?.url) {
          // If panImage already has a URL (from previous save), use it
          panImageUpload = step3.panImage;
        } else if (typeof step3.panImage === 'string' && step3.panImage.startsWith('http')) {
          // If it's a direct URL string
          panImageUpload = { url: step3.panImage };
        }

        // Verify PAN image is present
        if (!panImageUpload || !panImageUpload.url) {
          throw new Error('PAN image must be uploaded');
        }

        // Upload GST image if it's a File object (only if GST registered)
        let gstImageUpload = null;
        if (step3.gstRegistered) {
          if (step3.gstImage instanceof File) {
            try {
              gstImageUpload = await handleUpload(step3.gstImage, "appzeto/restaurant/gst");
              // Verify upload was successful and has valid URL
              if (!gstImageUpload || !gstImageUpload.url) {
                throw new Error('Failed to upload GST image');
              }
            } catch (uploadError) {
              console.error('GST image upload error:', uploadError);
              throw new Error(`Failed to upload GST image: ${uploadError.message}`);
            }
          } else if (step3.gstImage?.url) {
            // If gstImage already has a URL (from previous save), use it
            gstImageUpload = step3.gstImage;
          } else if (typeof step3.gstImage === 'string' && step3.gstImage.startsWith('http')) {
            // If it's a direct URL string
            gstImageUpload = { url: step3.gstImage };
          }

          // Verify GST image is present if GST registered
          if (!gstImageUpload || !gstImageUpload.url) {
            throw new Error('GST image must be uploaded when GST registered');
          }
        }

        // Upload FSSAI image if it's a File object
        let fssaiImageUpload = null;
        if (step3.fssaiImage instanceof File) {
          try {
            fssaiImageUpload = await handleUpload(step3.fssaiImage, "appzeto/restaurant/fssai");
            // Verify upload was successful and has valid URL
            if (!fssaiImageUpload || !fssaiImageUpload.url) {
              throw new Error('Failed to upload FSSAI image');
            }
          } catch (uploadError) {
            console.error('FSSAI image upload error:', uploadError);
            throw new Error(`Failed to upload FSSAI image: ${uploadError.message}`);
          }
        } else if (step3.fssaiImage?.url) {
          // If fssaiImage already has a URL (from previous save), use it
          fssaiImageUpload = step3.fssaiImage;
        } else if (typeof step3.fssaiImage === 'string' && step3.fssaiImage.startsWith('http')) {
          // If it's a direct URL string
          fssaiImageUpload = { url: step3.fssaiImage };
        }

        // Verify FSSAI image is present
        if (!fssaiImageUpload || !fssaiImageUpload.url) {
          throw new Error('FSSAI image must be uploaded');
        }

        const payload = {
          step3: {
            pan: {
              panNumber: step3.panNumber || "",
              nameOnPan: step3.nameOnPan || "",
              image: panImageUpload
            },
            gst: {
              isRegistered: step3.gstRegistered || false,
              gstNumber: step3.gstNumber || "",
              legalName: step3.gstLegalName || "",
              address: step3.gstAddress || "",
              image: gstImageUpload
            },
            fssai: {
              registrationNumber: step3.fssaiNumber || "",
              expiryDate: step3.fssaiExpiry || null,
              image: fssaiImageUpload
            },
            bank: {
              accountNumber: step3.accountNumber || "",
              ifscCode: step3.ifscCode || "",
              accountHolderName: step3.accountHolderName || "",
              accountType: step3.accountType || ""
            }
          },
          completedSteps: 3
        };

        // Update local state with uploaded image URLs
        setStep3(prev => ({
          ...prev,
          panImage: panImageUpload,
          gstImage: gstImageUpload,
          fssaiImage: fssaiImageUpload
        }));

        if (!isProspect) {
          // REMOVED: Intermediate API call to save Step 3
          // await api.put("/restaurant/onboarding", payload);
        }
        setStep(4);
      } else if (step === 4) {
        if (isProspect) {
          setStep(5);
          return;
        }
        const payload = {
          step4: {
            estimatedDeliveryTime: step4.estimatedDeliveryTime,
            featuredDish: step4.featuredDish,
            featuredPrice: parseFloat(step4.featuredPrice) || 249,
            offer: step4.offer
          },
          completedSteps: 4
        };
        if (!isProspect) {
          // REMOVED: Intermediate API call to save Step 4
          // await api.put("/restaurant/onboarding", payload);
        }
        setStep(5);
      } else if (step === 5) {
        // 1. Final Account Creation for Prospects
        if (isProspect && pendingData) {
          const regResponse = await restaurantAPI.verifyOTP(
            pendingData.phone,
            pendingData.otpCode,
            "register",
            step1.restaurantName,
            pendingData.email,
            step5.businessModel
          );

          const regData = regResponse?.data?.data || regResponse?.data;
          if (!regData?.accessToken) {
            throw new Error("Registration failed. Please try again.");
          }

          // Authenticate the user
          setRestaurantAuthData("restaurant", regData.accessToken, regData.restaurant);
          localStorage.setItem("restaurant_accessToken", regData.accessToken);
          localStorage.setItem("restaurant_authenticated", "true");
        }

        // 2. Perform necessary uploads for EVERYONE
        const menuUploads = [];
        for (const file of step2.menuImages) {
          if (file instanceof File) {
            const uploaded = await handleUpload(file, "appzeto/restaurant/menu");
            menuUploads.push(uploaded);
          } else if (file?.url || (typeof file === 'string' && file.startsWith('http'))) {
            menuUploads.push(file?.url ? file : { url: file });
          }
        }

        let profileUpload = step2.profileImage;
        if (step2.profileImage instanceof File) {
          profileUpload = await handleUpload(step2.profileImage, "appzeto/restaurant/profile");
        }

        let panUpload = step3.panImage;
        if (step3.panImage instanceof File) {
          panUpload = await handleUpload(step3.panImage, "appzeto/restaurant/pan");
        }

        let gstUpload = step3.gstImage;
        if (step3.gstRegistered && step3.gstImage instanceof File) {
          gstUpload = await handleUpload(step3.gstImage, "appzeto/restaurant/gst");
        }

        let fssaiUpload = step3.fssaiImage;
        if (step3.fssaiImage instanceof File) {
          fssaiUpload = await handleUpload(step3.fssaiImage, "appzeto/restaurant/fssai");
        }

        // 3. Final submission with ALL onboarding data
        const finalPayload = {
          step1,
          step2: {
            menuImageUrls: menuUploads,
            profileImageUrl: profileUpload,
            cuisines: step2.cuisines,
            deliveryTimings: {
              openingTime: step2.openingTime,
              closingTime: step2.closingTime
            },
            openDays: step2.openDays
          },
          step3: {
            pan: {
              panNumber: step3.panNumber,
              nameOnPan: step3.nameOnPan,
              image: panUpload
            },
            gst: {
              isRegistered: step3.gstRegistered,
              gstNumber: step3.gstNumber,
              legalName: step3.gstLegalName,
              address: step3.gstAddress,
              image: gstUpload
            },
            fssai: {
              registrationNumber: step3.fssaiNumber,
              expiryDate: step3.fssaiExpiry,
              image: fssaiUpload
            },
            bank: {
              accountNumber: step3.accountNumber,
              ifscCode: step3.ifscCode,
              accountHolderName: step3.accountHolderName,
              accountType: step3.accountType
            }
          },
          step4: {
            estimatedDeliveryTime: step4.estimatedDeliveryTime,
            featuredDish: step4.featuredDish,
            featuredPrice: parseFloat(step4.featuredPrice) || 249,
            offer: step4.offer
          },
          step5: {
            businessModel: step5.businessModel
          },
          businessModel: step5.businessModel,
          completedSteps: 5
        };

        // If Subscription based, we DON'T save to DB yet.
        if (step5.businessModel === "Subscription Base") {
          localStorage.setItem("pending_subscription_onboarding", JSON.stringify(finalPayload));
        } else {
          // Ensure model is set correctly
          // For Commission Base, we save now.
          // For Subscription Base, we only save step5 in state/local, then redirect to /restaurant/plans to pay and then save.
          await api.put("/restaurant/onboarding", finalPayload);
        }

        // 4. Cleanup for Prospects
        if (isProspect) {
          localStorage.removeItem("pendingRestaurantRegistration");
          setIsProspect(false);
          setPendingData(null);
        }

        // Wait a moment to ensure data is saved, then navigate
        setTimeout(() => {
          if (step5.businessModel === "Subscription Base") {
            // Keep localStorage data until payment is successful
            navigate("/restaurant/subscription-plans", { replace: true });
          } else {
            toast.success("Registration Successful!");
            // Clear localStorage for Commission Base since it's already saved to DB
            clearOnboardingFromLocalStorage();
            navigate("/restaurant/hub", { replace: true });
          }
        }, 800);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleCuisine = (cuisine) => {
    const updated = step2.cuisines.includes(cuisine)
      ? step2.cuisines.filter(c => c !== cuisine)
      : [...step2.cuisines, cuisine];

    if (updated.length > 3 && !step2.cuisines.includes(cuisine)) return;

    setStep2(prev => ({ ...prev, cuisines: updated }));
    validateField('cuisines', updated);
  };

  const toggleDay = (day) => {
    const updated = step2.openDays.includes(day)
      ? step2.openDays.filter(d => d !== day)
      : [...step2.openDays, day];

    setStep2(prev => ({ ...prev, openDays: updated }));
    validateField('openDays', updated);
  };

  const renderStep1 = () =>
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-700">Restaurant name<span className="text-red-500">*</span></Label>
            <div className="relative flex items-center">
              <Input
                value={step1.restaurantName || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setStep1({ ...step1, restaurantName: val });
                  // Immediate feedback: clear error if now valid
                  validateField('restaurantName', val);
                }}
                onFocus={() => setFormErrors(prev => ({ ...prev, restaurantName: null }))}
                onBlur={() => isEditingName && validateField('restaurantName')}
                disabled={!isEditingName}
                className={`mt-1 bg-white text-sm text-black placeholder-black pr-10 ${!isEditingName ? "bg-gray-50" : ""
                  } ${formErrors.restaurantName ? "border-red-500" : "border-gray-200"}`}
                placeholder="Customers will see this name"
              />
              <button
                type="button"
                onClick={() => setIsEditingName(!isEditingName)}
                className="absolute right-3 top-1/2 -translate-y-1/2 mt-1"
                title={isEditingName ? "Lock field" : "Edit name"}
              >
                <Pencil
                  className={`h-4 w-4 ${isEditingName ? "text-blue-600" : "text-gray-400"}`}
                />
              </button>
            </div>
            {formErrors.restaurantName && <p className="text-red-500 text-[10px] mt-1">{formErrors.restaurantName}</p>}
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
        <p className="text-sm text-gray-600 mb-4">
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name<span className="text-red-500">*</span></Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => {
                const val = handleNameChange(e.target.value);
                setStep1({ ...step1, ownerName: val });
                validateField('ownerName', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, ownerName: null }))}
              onBlur={() => validateField('ownerName')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.ownerName ? "border-red-500" : "border-gray-200"}`}
              placeholder="Owner full name" />
            {formErrors.ownerName && <p className="text-red-500 text-[10px] mt-1">{formErrors.ownerName}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Email address<span className="text-red-500">*</span></Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep1({ ...step1, ownerEmail: val });
                validateField('ownerEmail', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, ownerEmail: null }))}
              onBlur={() => validateField('ownerEmail')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.ownerEmail ? "border-red-500" : "border-gray-200"}`}
              placeholder="owner@example.com" />
            {formErrors.ownerEmail && <p className="text-red-500 text-[10px] mt-1">{formErrors.ownerEmail}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Phone number<span className="text-red-500">*</span></Label>
            <Input
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setStep1({ ...step1, ownerPhone: val });
                validateField('ownerPhone', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, ownerPhone: null }))}
              onBlur={() => validateField('ownerPhone')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.ownerPhone ? "border-red-500" : "border-gray-200"}`}
              placeholder="9876543210" />
            {formErrors.ownerPhone && <p className="text-red-500 text-[10px] mt-1">{formErrors.ownerPhone}</p>}
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
        <div>
          <Label className="text-xs text-gray-700">Primary contact number<span className="text-red-500">*</span></Label>
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
              setStep1({ ...step1, primaryContactNumber: val });
              validateField('primaryContactNumber', val);
            }}
            onFocus={() => setFormErrors(prev => ({ ...prev, primaryContactNumber: null }))}
            onBlur={() => validateField('primaryContactNumber')}
            className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.primaryContactNumber ? "border-red-500" : "border-gray-200"}`}
            placeholder="Alternate contact number" />
          {formErrors.primaryContactNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.primaryContactNumber}</p>}
          <p className="text-[11px] text-gray-500 mt-1">
            Customers, delivery partners and Appzeto may call on this number for order
            support.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add your restaurant's location for order pick-up.
          </p>
          <div>
            <Label className="text-xs text-gray-700">Area / Sector / Locality<span className="text-red-500">*</span></Label>
            <Input
              value={step1.location?.area || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep1({
                  ...step1,
                  location: { ...step1.location, area: val }
                });
                validateField('area', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, area: null }))}
              onBlur={() => validateField('area')}
              className={`bg-white text-sm ${formErrors.area ? "border-red-500" : "border-gray-200"}`}
              placeholder="Restaurant area or street" />
            {formErrors.area && <p className="text-red-500 text-[10px] mt-1">{formErrors.area}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">City<span className="text-red-500">*</span></Label>
            <Input
              value={step1.location?.city || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep1({
                  ...step1,
                  location: { ...step1.location, city: val }
                });
                validateField('city', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, city: null }))}
              onBlur={() => validateField('city')}
              className={`bg-white text-sm ${formErrors.city ? "border-red-500" : "border-gray-200"}`}
              placeholder="City name" />
            {formErrors.city && <p className="text-red-500 text-[10px] mt-1">{formErrors.city}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">Shop no. / Building no.<span className="text-red-500">*</span></Label>
            <Input
              value={step1.location?.addressLine1 || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep1({
                  ...step1,
                  location: { ...step1.location, addressLine1: val }
                });
                validateField('addressLine1', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, addressLine1: null }))}
              onBlur={() => validateField('addressLine1')}
              className={`bg-white text-sm ${formErrors.addressLine1 ? "border-red-500" : "border-gray-200"}`}
              placeholder="Building / House number" />
            {formErrors.addressLine1 && <p className="text-red-500 text-[10px] mt-1">{formErrors.addressLine1}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">Floor / Tower (optional)</Label>
            <Input
              value={step1.location?.addressLine2 || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep1({
                  ...step1,
                  location: { ...step1.location, addressLine2: val }
                });
                validateField('addressLine2', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, addressLine2: null }))}
              onBlur={() => validateField('addressLine2')}
              className={`bg-white text-sm ${formErrors.addressLine2 ? "border-red-500" : "border-gray-200"}`}
              placeholder="Floor or tower name" />
            {formErrors.addressLine2 && <p className="text-red-500 text-[10px] mt-1">{formErrors.addressLine2}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">Nearby Landmark (optional)</Label>
            <Input
              value={step1.location?.landmark || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep1({
                  ...step1,
                  location: { ...step1.location, landmark: val }
                });
                validateField('landmark', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, landmark: null }))}
              onBlur={() => validateField('landmark')}
              className={`bg-white text-sm ${formErrors.landmark ? "border-red-500" : "border-gray-200"}`}
              placeholder="e.g. Near Apollo Hospital" />
            {formErrors.landmark && <p className="text-red-500 text-[10px] mt-1">{formErrors.landmark}</p>}
          </div>

          <p className="text-[11px] text-gray-500 mt-1">
            Please ensure that this address is the same as mentioned on your FSSAI license.
          </p>
        </div>
      </section>
    </div>;



  const removeMenuImage = (idx) => {
    // Animate out first, then remove
    setRemovingImages(prev => new Set([...prev, idx]));
    setTimeout(() => {
      setStep2((prev) => {
        const updated = prev.menuImages.filter((_, i) => i !== idx);
        // Use validateField for consistent real-time feedback
        validateField('menuImages', updated);
        // Clear native input if all images removed
        if (updated.length === 0) clearFileInput("menuImagesInput");
        return { ...prev, menuImages: updated };
      });
      setRemovingImages(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }, 280);
  };

  const removeProfileImage = () => {
    setRemovingProfile(true);
    setTimeout(() => {
      setStep2((prev) => ({ ...prev, profileImage: null }));
      setRemovingProfile(false);
      validateField('profileImage', null);
      clearFileInput("profileImageInput");
    }, 280);
  };
  const renderStep2 = () =>
    <div className="space-y-6">
      {/* Images section */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <p className="text-xs text-gray-500">
          Add clear photos of your printed menu and a primary profile image. This helps customers
          understand what you serve.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex items-center justify-between flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload menu images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP • You can select multiple files
                </span>
              </div>
            </div>
            <label
              htmlFor="menuImagesInput"
              className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black  border-black text-xs font-medium cursor-pointer     w-full items-center">

              <Upload className="w-4.5 h-4.5" />
              <span>Choose files</span>
            </label>
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;

                setStep2((prev) => ({
                  ...prev,
                  menuImages: [...(prev.menuImages || []), ...files] // Append new files to existing ones
                }));
                // Reset input to allow selecting same file again
                e.target.value = '';
              }} />

          </div>

          {/* Menu image previews */}
          {!!step2.menuImages.length &&
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null;
                let imageName = `Image ${idx + 1}`;

                if (file instanceof File) {
                  imageUrl = URL.createObjectURL(file);
                  imageName = file.name;
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url;
                  imageName = file.name || `Image ${idx + 1}`;
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file;
                }

                return (
                  <div
                    key={idx}
                    className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100 group"
                    style={{
                      transition: 'opacity 0.28s ease, transform 0.28s ease',
                      opacity: removingImages.has(idx) ? 0 : 1,
                      transform: removingImages.has(idx) ? 'scale(0.75)' : 'scale(1)',
                      pointerEvents: removingImages.has(idx) ? 'none' : 'auto',
                    }}>

                    {imageUrl ?
                      <FilePreview
                        file={file}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-cover"
                      /> :


                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    }

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeMenuImage(idx)}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/50 hover:bg-red-600 text-white rounded-full transition-colors z-10"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>);

              })}
            </div>
          }
        </div>

        {/* Profile image */}
        <div className="space-y-4">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image<span className="text-red-500">*</span></Label>
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 flex-shrink-0"
              style={{
                transition: 'opacity 0.28s ease, transform 0.28s ease, border-color 0.2s ease',
                opacity: removingProfile ? 0 : 1,
                transform: removingProfile ? 'scale(0.75)' : 'scale(1)',
                borderColor: formErrors.profileImage ? '#ef4444' : '#f3f4f6'
              }}>
              {step2.profileImage ?
                <FilePreview
                  file={step2.profileImage}
                  alt="Profile"
                  className="h-full w-full object-cover"
                /> :

                <ImageIcon className="h-8 w-8 text-gray-400" />
              }
            </div>
            <div className="flex-1">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload profile photo</span>
                <span className="text-[11px] text-gray-500">
                  This will be shown on your listing card and restaurant page.
                </span>
                {step2.profileImage && (
                  <button
                    type="button"
                    onClick={removeProfileImage}
                    className="mt-1 text-[10px] text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                    disabled={removingProfile}
                  >
                    <X className="w-2.5 h-2.5" />
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>
          <label
            htmlFor="profileImageInput"
            onClick={() => handleFileClick('profileImage', 'profileImageInput')}
            style={{
              opacity: (step2.profileImage || removingProfile) ? 0.5 : 1,
              pointerEvents: (step2.profileImage || removingProfile) ? 'none' : 'auto',
              cursor: (step2.profileImage || removingProfile) ? 'not-allowed' : 'pointer'
            }}
            className={`inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border text-xs font-medium w-full ${formErrors.profileImage ? "border-red-500" : "border-black"}`}>

            <Upload className="w-4.5 h-4.5" />
            <span>Upload</span>
          </label>
          <input
            id="profileImageInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              filePickedRef.current = true;
              const file = e.target.files?.[0] || null;
              if (file) {
                setStep2((prev) => ({
                  ...prev,
                  profileImage: file
                }));
                validateField('profileImage', file); // Validate with the actual file object
              }
              e.target.value = '';
            }} />
          {formErrors.profileImage && <p className="text-red-500 text-[10px] mt-1">{formErrors.profileImage}</p>}
        </div>
      </section>

      {/* Operational details */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        {/* Cuisines */}
        <div>
          <Label className="text-xs text-gray-700">Select cuisines<span className="text-red-500">*</span> (up to 3)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisinesOptions.map((cuisine) => {
              const active = step2.cuisines.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => {
                    toggleCuisine(cuisine);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`
                  }>

                  {cuisine}
                </button>);

            })}
          </div>
          {formErrors.cuisines && <p className="text-red-500 text-[10px] mt-2">{formErrors.cuisines}</p>}
        </div>

        {/* Timings */}
        <div className="space-y-3">
          <Label className="text-xs text-gray-700">Delivery timings<span className="text-red-500">*</span></Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <TimeSelector
                label="Opening time"
                value={step2.openingTime || ""}
                onBlur={() => validateField('openingTime')}
                onChange={(val) => {
                  setStep2({
                    ...step2,
                    openingTime: val || "",
                    // If opening time is cleared, also clear closing time
                    closingTime: val ? step2.closingTime : ""
                  });
                  validateField('openingTime', val || "");
                }} />
              {formErrors.openingTime && <p className="text-red-500 text-[10px] mt-1">{formErrors.openingTime}</p>}
            </div>

            <div>
              <TimeSelector
                label="Closing time"
                value={step2.closingTime || ""}
                disabled={!step2.openingTime}
                onBlur={() => validateField('closingTime')}
                onChange={(val) => {
                  setStep2({ ...step2, closingTime: val || "" });
                  validateField('closingTime', val || "");
                }} />
              {!step2.openingTime && (
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <span>???</span> Select opening time first
                </p>
              )}
              {formErrors.closingTime && <p className="text-red-500 text-[10px] mt-1">{formErrors.closingTime}</p>}
            </div>
          </div>
        </div>

        {/* Open days */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days<span className="text-red-500">*</span></span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts delivery orders.
          </p>
          <div
            className={`mt-1 grid grid-cols-7 gap-1.5 sm:gap-2 p-2 rounded-md ${formErrors.openDays ? "border border-red-500" : ""}`}
            onBlur={() => validateField('openDays')}
            tabIndex={0}
          >
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    toggleDay(day);
                  }}
                  className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`
                  }>

                  {day.charAt(0)}
                </button>);

            })}
          </div>
          {formErrors.openDays && <p className="text-red-500 text-[10px] mt-2">{formErrors.openDays}</p>}
        </div>
      </section>
    </div>;


  const renderStep3 = () =>
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">PAN details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700">PAN number<span className="text-red-500">*</span></Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                setStep3({ ...step3, panNumber: val });
                validateField('panNumber', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, panNumber: null }))}
              onBlur={() => validateField('panNumber')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.panNumber ? "border-red-500" : "border-gray-200"}`} />
            {formErrors.panNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.panNumber}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Name on PAN<span className="text-red-500">*</span></Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) => {
                const val = handleNameChange(e.target.value);
                setStep3({ ...step3, nameOnPan: val });
                validateField('nameOnPan', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, nameOnPan: null }))}
              onBlur={() => validateField('nameOnPan')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.nameOnPan ? "border-red-500" : "border-gray-200"}`} />
            {formErrors.nameOnPan && <p className="text-red-500 text-[10px] mt-1">{formErrors.nameOnPan}</p>}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700">PAN image<span className="text-red-500">*</span></Label>
          <div className="mt-1 space-y-2">
            <Input
              id="panImageInput"
              type="file"
              accept="image/*"
              onClick={() => handleFileClick('panImage', 'panImageInput')}
              onChange={(e) => {
                filePickedRef.current = true;
                const file = e.target.files?.[0] || null;
                setStep3(prev => ({ ...prev, panImage: file }));
                validateField('panImage', file);
              }}
              className={`bg-white text-sm text-black placeholder-black ${formErrors.panImage ? "border-red-500" : "border-gray-200"} ${step3.panImage ? "text-transparent" : ""}`} />
            {formErrors.panImage && <p className="text-red-500 text-[10px] mt-1">{formErrors.panImage}</p>}
            {step3.panImage && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-green-600 bg-green-50 px-2 py-1 rounded-sm border border-green-100">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[180px]">
                    {step3.panImage instanceof File ? step3.panImage.name : "PAN image restored"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep3(prev => ({ ...prev, panImage: null }));
                    validateField('panImage', null);
                    clearFileInput("panImageInput");
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">GST details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`
            }>

            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`
            }>

            No
          </button>
        </div>
        {step3.gstRegistered &&
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-700">GST number<span className="text-red-500">*</span></Label>
              <Input
                value={step3.gstNumber || ""}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
                  setStep3({ ...step3, gstNumber: val });
                  validateField('gstNumber', val);
                }}
                onFocus={() => setFormErrors(prev => ({ ...prev, gstNumber: null }))}
                onBlur={() => validateField('gstNumber')}
                className={`mt-1 bg-white text-sm ${formErrors.gstNumber ? "border-red-500" : "border-gray-200"}`}
                placeholder="Enter GST number" />
              {formErrors.gstNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.gstNumber}</p>}
            </div>

            <div>
              <Label className="text-xs text-gray-700">Legal name<span className="text-red-500">*</span></Label>
              <Input
                value={step3.gstLegalName || ""}
                onChange={(e) => {
                  const val = handleNameChange(e.target.value);
                  setStep3({ ...step3, gstLegalName: val });
                  validateField('gstLegalName', val);
                }}
                onFocus={() => setFormErrors(prev => ({ ...prev, gstLegalName: null }))}
                onBlur={() => validateField('gstLegalName')}
                className={`mt-1 bg-white text-sm ${formErrors.gstLegalName ? "border-red-500" : "border-gray-200"}`}
                placeholder="Enter legal name" />
              {formErrors.gstLegalName && <p className="text-red-500 text-[10px] mt-1">{formErrors.gstLegalName}</p>}
            </div>

            <div>
              <Label className="text-xs text-gray-700">Registered address<span className="text-red-500">*</span></Label>
              <Input
                value={step3.gstAddress || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setStep3({ ...step3, gstAddress: val });
                  validateField('gstAddress', val);
                }}
                onFocus={() => setFormErrors(prev => ({ ...prev, gstAddress: null }))}
                onBlur={() => validateField('gstAddress')}
                className={`mt-1 bg-white text-sm ${formErrors.gstAddress ? "border-red-500" : "border-gray-200"}`}
                placeholder="Enter registered address" />
              {formErrors.gstAddress && <p className="text-red-500 text-[10px] mt-1">{formErrors.gstAddress}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">GST certificate image<span className="text-red-500">*</span></Label>
              <Input
                id="gstImageInput"
                type="file"
                accept="image/*"
                onClick={() => handleFileClick('gstImage', 'gstImageInput')}
                onChange={(e) => {
                  filePickedRef.current = true;
                  const file = e.target.files?.[0] || null;
                  setStep3(prev => ({ ...prev, gstImage: file }));
                  validateField('gstImage', file);
                }}
                className={`bg-white text-sm ${formErrors.gstImage ? "border-red-500" : "border-gray-200"} ${step3.gstImage ? "text-transparent" : ""}`} />
              {formErrors.gstImage && <p className="text-red-500 text-[10px] mt-1">{formErrors.gstImage}</p>}
              {step3.gstImage && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-green-600 bg-green-50 px-2 py-1 rounded-sm border border-green-100">
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[180px]">
                      {step3.gstImage instanceof File ? step3.gstImage.name : "GST certificate restored"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep3(prev => ({ ...prev, gstImage: null }));
                      validateField('gstImage', null);
                      clearFileInput("gstImageInput");
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

          </div>
        }
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-6">
        <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs text-gray-700 mb-1.5 block">FSSAI number<span className="text-red-500">*</span></Label>
            <Input
              value={step3.fssaiNumber || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 14);
                setStep3({ ...step3, fssaiNumber: val });
                validateField('fssaiNumber', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, fssaiNumber: null }))}
              onBlur={() => validateField('fssaiNumber')}
              className={`bg-white text-sm ${formErrors.fssaiNumber ? "border-red-500" : "border-gray-200"}`}
              placeholder="FSSAI number" />
            {formErrors.fssaiNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.fssaiNumber}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700 mb-1.5 block">FSSAI expiry date<span className="text-red-500">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`w-full px-3 py-2 border rounded-md bg-white text-sm text-left flex items-center justify-between hover:bg-gray-50 ${formErrors.fssaiExpiry ? "border-red-500" : "border-gray-200"}`}>

                  <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-500"}>
                    {step3.fssaiExpiry ?
                      new Date(step3.fssaiExpiry).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      }) :
                      "Select expiry date"}
                  </span>
                  <CalendarIcon className="w-4 h-4 text-gray-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
                onCloseAutoFocus={() => validateField('fssaiExpiry')}
              >
                <Calendar
                  mode="single"
                  selected={step3.fssaiExpiry ? new Date(step3.fssaiExpiry) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const formattedDate = date.toISOString().split("T")[0];
                      setStep3({ ...step3, fssaiExpiry: formattedDate });
                      validateField('fssaiExpiry', formattedDate);
                    }
                  }}
                  initialFocus
                  className="rounded-md border border-gray-200" />

              </PopoverContent>
            </Popover>
            {formErrors.fssaiExpiry && <p className="text-red-500 text-[10px] mt-1">{formErrors.fssaiExpiry}</p>}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-600 mb-1.5 block">FSSAI certificate image<span className="text-red-500">*</span></Label>
          <Input
            id="fssaiImageInput"
            type="file"
            accept="image/*"
            onClick={() => handleFileClick('fssaiImage', 'fssaiImageInput')}
            onChange={(e) => {
              filePickedRef.current = true;
              const file = e.target.files?.[0] || null;
              setStep3(prev => ({ ...prev, fssaiImage: file }));
              validateField('fssaiImage', file);
            }}
            className={`bg-white text-sm ${formErrors.fssaiImage ? "border-red-500" : "border-gray-200"} ${step3.fssaiImage ? "text-transparent" : ""}`} />
          {formErrors.fssaiImage && <p className="text-red-500 text-[10px] mt-1">{formErrors.fssaiImage}</p>}
          {step3.fssaiImage && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-green-600 bg-green-50 px-2 py-1 rounded-sm border border-green-100">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">
                  {step3.fssaiImage instanceof File ? step3.fssaiImage.name : "FSSAI certificate restored"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep3(prev => ({ ...prev, fssaiImage: null }));
                  validateField('fssaiImage', null);
                  clearFileInput("fssaiImageInput");
                }}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-6">
        <h2 className="text-lg font-semibold text-black">Bank account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs text-gray-700 mb-1.5 block">Account number<span className="text-red-500">*</span></Label>
            <Input
              value={step3.accountNumber || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 18);
                setStep3({ ...step3, accountNumber: val });
                validateField('accountNumber', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, accountNumber: null }))}
              onBlur={() => validateField('accountNumber')}
              className={`bg-white text-sm ${formErrors.accountNumber ? "border-red-500" : "border-gray-200"}`}
              placeholder="Account number" />
            {formErrors.accountNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.accountNumber}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700 mb-1.5 block">Re-enter account number<span className="text-red-500">*</span></Label>
            <Input
              value={step3.confirmAccountNumber || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 18);
                setStep3({ ...step3, confirmAccountNumber: val });
                validateField('confirmAccountNumber', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, confirmAccountNumber: null }))}
              onBlur={() => validateField('confirmAccountNumber')}
              className={`bg-white text-sm ${formErrors.confirmAccountNumber ? "border-red-500" : "border-gray-200"}`}
              placeholder="Re-enter account number" />
            {formErrors.confirmAccountNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.confirmAccountNumber}</p>}
          </div>

        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs text-gray-700 mb-1.5 block">IFSC code<span className="text-red-500">*</span></Label>
            <Input
              value={step3.ifscCode || ""}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
                setStep3({ ...step3, ifscCode: val });
                validateField('ifscCode', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, ifscCode: null }))}
              onBlur={() => validateField('ifscCode')}
              className={`mt-1 bg-white text-sm ${formErrors.ifscCode ? "border-red-500" : "border-gray-200"}`}
              placeholder="IFSC code" />
            {formErrors.ifscCode && <p className="text-red-500 text-[10px] mt-1">{formErrors.ifscCode}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700 mb-1.5 block">Account type<span className="text-red-500">*</span></Label>
            <Select
              value={step3.accountType || ""}
              onValueChange={(val) => {
                setStep3({ ...step3, accountType: val });
                validateField('accountType', val);
              }}
              onOpenChange={(open) => {
                if (open) {
                  setFormErrors(prev => ({ ...prev, accountType: null }));
                } else {
                  validateField('accountType'); // Validate when select closes
                }
              }}
            >
              <SelectTrigger className={`bg-white text-sm flex justify-start gap-1 ${formErrors.accountType ? "border-red-500" : "border-gray-200"}`}>
                <span className="text-gray-500">Account Type</span>
                <span className="text-black font-medium">{step3.accountType || ""}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Saving">Saving</SelectItem>
                <SelectItem value="Current">Current</SelectItem>
              </SelectContent>
            </Select>
            {formErrors.accountType && <p className="text-red-500 text-[10px] mt-1">{formErrors.accountType}</p>}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700 mb-1.5 block">Account holder name<span className="text-red-500">*</span></Label>
          <Input
            value={step3.accountHolderName || ""}
            onChange={(e) => {
              const val = handleNameChange(e.target.value);
              setStep3({ ...step3, accountHolderName: val });
              validateField('accountHolderName', val);
            }}
            onFocus={() => setFormErrors(prev => ({ ...prev, accountHolderName: null }))}
            onBlur={() => validateField('accountHolderName')}
            className={`mt-1 bg-white text-sm ${formErrors.accountHolderName ? "border-red-500" : "border-gray-200"}`}
            placeholder="Account holder name" />
          {formErrors.accountHolderName && <p className="text-red-500 text-[10px] mt-1">{formErrors.accountHolderName}</p>}
        </div>

      </section>
    </div>;


  const renderStep4 = () =>
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Delivery & Featured Items</h2>
        <p className="text-sm text-gray-600">
          Set your delivery expectations and highlight your best dish.
        </p>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Estimated Delivery Time (minutes)<span className="text-red-500">*</span></Label>
            <Input
              value={step4.estimatedDeliveryTime || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep4({ ...step4, estimatedDeliveryTime: val });
                validateField('estimatedDeliveryTime', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, estimatedDeliveryTime: null }))}
              onBlur={() => validateField('estimatedDeliveryTime')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.estimatedDeliveryTime ? "border-red-500" : "border-gray-200"}`}
              placeholder="e.g. 30-45" />
            {formErrors.estimatedDeliveryTime && <p className="text-red-500 text-[10px] mt-1">{formErrors.estimatedDeliveryTime}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">Featured Dish Name<span className="text-red-500">*</span></Label>
            <Input
              value={step4.featuredDish || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep4({ ...step4, featuredDish: val });
                validateField('featuredDish', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, featuredDish: null }))}
              onBlur={() => validateField('featuredDish')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.featuredDish ? "border-red-500" : "border-gray-200"}`}
              placeholder="e.g. Butter Chicken" />
            {formErrors.featuredDish && <p className="text-red-500 text-[10px] mt-1">{formErrors.featuredDish}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">Featured Dish Price (???)<span className="text-red-500">*</span></Label>
            <Input
              type="number"
              value={step4.featuredPrice || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep4({ ...step4, featuredPrice: val });
                validateField('featuredPrice', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, featuredPrice: null }))}
              onBlur={() => validateField('featuredPrice')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.featuredPrice ? "border-red-500" : "border-gray-200"}`}
              placeholder="e.g. 299" />
            {formErrors.featuredPrice && <p className="text-red-500 text-[10px] mt-1">{formErrors.featuredPrice}</p>}
          </div>

          <div>
            <Label className="text-xs text-gray-700">Special Offer / Promotion<span className="text-red-500">*</span></Label>
            <Input
              value={step4.offer || ""}
              onChange={(e) => {
                const val = e.target.value;
                setStep4({ ...step4, offer: val });
                validateField('offer', val);
              }}
              onFocus={() => setFormErrors(prev => ({ ...prev, offer: null }))}
              onBlur={() => validateField('offer')}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${formErrors.offer ? "border-red-500" : "border-gray-200"}`}
              placeholder="e.g. 20% OFF up to ???100" />
            {formErrors.offer && <p className="text-red-500 text-[10px] mt-1">{formErrors.offer}</p>}
          </div>
        </div>
      </section>
    </div>;


  const renderStep5 = () =>
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-6">
        <h2 className="text-xl font-bold text-black border-b pb-4">Choose Your Business Model<span className="text-red-500">*</span></h2>
        <p className="text-sm text-gray-600">
          Select how you want to partner with us. This determines your fee structure and features.
        </p>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 p-1 rounded-xl ${formErrors.businessModel ? "border border-red-500" : ""}`}>
          {/* Commission Base Option */}
          <div
            onClick={() => {
              const val = "Commission Base";
              setStep5({ businessModel: val });
              validateField('businessModel', val);
            }}
            className={`cursor-pointer p-6 rounded-xl border-2 transition-all duration-300 relative overflow-hidden ${step5.businessModel === "Commission Base" ?
              "border-black bg-gray-50 shadow-md" :
              "border-gray-200 hover:border-gray-300"}`
            }>

            {step5.businessModel === "Commission Base" &&
              <div className="absolute top-3 right-3">
                <CheckCircle className="w-6 h-6 text-black fill-white" />
              </div>
            }
            <div className="mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${step5.businessModel === "Commission Base" ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`
              }>
                <span className="text-lg font-bold">%</span>
              </div>
              <h3 className="text-lg font-bold text-black">Commission Base</h3>
              <p className="text-xs text-gray-500 mt-1">Best for restaurants starting out</p>
            </div>
            <ul className="space-y-3 mt-4">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Pay only when you get orders</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Standard commission rate applies</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span className="text-gray-800 font-semibold">Unlimited food item additions</span>
              </li>
            </ul>
          </div>

          {/* Subscription Based Option */}
          <div
            onClick={() => {
              const val = "Subscription Base";
              setStep5({ businessModel: val });
              validateField('businessModel', val);
            }}
            className={`cursor-pointer p-6 rounded-xl border-2 transition-all duration-300 relative overflow-hidden ${step5.businessModel === "Subscription Base" ?
              "border-black bg-gray-50 shadow-md" :
              "border-gray-200 hover:border-gray-300"}`
            }>

            {step5.businessModel === "Subscription Base" &&
              <div className="absolute top-3 right-3">
                <CheckCircle className="w-6 h-6 text-black fill-white" />
              </div>
            }
            <div className="mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${step5.businessModel === "Subscription Base" ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`
              }>
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-black">Subscription Based</h3>
              <p className="text-xs text-gray-500 mt-1">Best for high-volume restaurants</p>
            </div>
            <ul className="space-y-3 mt-4">
              <li className="flex items-start gap-2 text-sm text-gray-800 font-semibold">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Unlimited food item additions</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Zero commission on orders</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                <span>Fixed monthly/yearly subscription</span>
              </li>
            </ul>
          </div>
        </div>
        {formErrors.businessModel && <p className="text-red-500 text-xs mt-2">{formErrors.businessModel}</p>}

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-6">
          <p className="text-xs text-blue-800 leading-relaxed">
            <strong>Note:</strong> Subscription plans can be purchased after your restaurant profile is approved by our team.
            The unlimited dish feature will be activated immediately upon selecting the subscription model.
          </p>
        </div>
      </section>
    </div>;




  const renderStep = () => {
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderStep3();
    if (step === 4) return renderStep4();
    return renderStep5();
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-2">
            {step >= 1 && (
              <button
                onClick={() => setShowExitModal(true)}
                className="p-2 -ml-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-300 transform hover:scale-110 active:scale-95"
                title="Exit Registration"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="text-sm font-bold text-black tracking-tight whitespace-nowrap">Restaurant Onboarding</div>
          </div>
          <div className="flex items-center gap-3">
            {import.meta.env.DEV &&
              <Button
                onClick={fillDummyData}
                variant="outline"
                size="sm"
                className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 flex items-center gap-1.5"
                title="Fill with dummy data (Dev only)">

                <Sparkles className="w-3 h-3" />
                Fill Dummy
              </Button>
            }
            <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
              Step {step} of 5
            </div>
          </div>
        </header>

        {error && (
          <div className="sticky top-4 z-50 mx-4 sm:mx-6 mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top duration-300 shadow-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shadow-sm">
              <span className="text-xl font-bold">!</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-900 leading-tight">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showExitModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 border border-gray-100">
              <div className="p-10 text-center">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <ArrowLeft className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-4 tracking-tight">Exit Registration?</h3>
                <p className="text-gray-500 font-medium leading-relaxed mb-10">
                  Are you sure you want to go back without completing the Registration?
                </p>
                <div className="space-y-4">
                  <Button
                    onClick={() => setShowExitModal(false)}
                    className="w-full h-14 bg-zinc-900 text-white hover:bg-black font-bold rounded-2xl transition-all duration-500 shadow-[0_10px_30px_rgba(0,0,0,0.15)] hover:shadow-[0_15px_35px_rgba(0,0,0,0.25)] active:scale-95"
                  >
                    Continue Registration
                  </Button>
                  <Button
                    onClick={handleExit}
                    className="w-full h-14 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-100 hover:border-red-200 font-bold text-base rounded-2xl transition-all duration-300 active:scale-95 shadow-sm hover:shadow-md"
                  >
                    Exit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
          {loading ?
            <p className="text-sm text-gray-600">Loading...</p> :

            renderStep()
          }
        </main>

        <footer className="px-4 sm:px-6 py-3 bg-white">
          <div className="flex justify-between items-center">
            {step > 1 ? (
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setError("");
                  // Removed setFormErrors({}) to persist field errors when returning
                  if (bannerTimeoutRef.current) {
                    clearTimeout(bannerTimeoutRef.current);
                  }
                  setStep((s) => Math.max(1, s - 1));
                }}
                className="text-sm text-gray-700 bg-transparent">
                Back
              </Button>
            ) : (
              <div /> // Spacer to keep 'Continue' button on the right
            )}
            <Button
              onClick={handleNext}
              disabled={saving}
              className="text-sm bg-black text-white px-6">

              {step === 5
                ? saving
                  ? "Saving..."
                  : step5.businessModel === "Subscription Base"
                    ? "Continue"
                    : "Register & Finish"
                : saving
                  ? "Saving..."
                  : "Continue"}
            </Button>
          </div>
        </footer>
      </div>
    </LocalizationProvider>);

}