import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Phone, AlertCircle, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedPage from "../../components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from
  "@/components/ui/select";
import { authAPI } from "@/lib/api";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/lib/api/config";
import { firebaseAuth, googleProvider, ensureFirebaseInitialized } from "@/lib/firebase";
import { setAuthData } from "@/lib/utils/auth";
import loginBanner from "@/assets/loginbanner.png";

// Common country codes
const countryCodes = [
  { code: "+1", country: "US/CA", fullName: "United States/Canada", flag: "🇺🇸", length: 10 },
  { code: "+44", country: "UK", fullName: "United Kingdom", flag: "🇬🇧", length: 10 },
  { code: "+91", country: "IN", fullName: "India", flag: "🇮🇳", length: 10 },
  { code: "+86", country: "CN", fullName: "China", flag: "🇨🇳", length: 11 },
  { code: "+81", country: "JP", fullName: "Japan", flag: "🇯🇵", length: 10 },
  { code: "+49", country: "DE", fullName: "Germany", flag: "🇩🇪", length: 11 },
  { code: "+33", country: "FR", fullName: "France", flag: "🇫🇷", length: 9 },
  { code: "+39", country: "IT", fullName: "Italy", flag: "🇮🇹", length: 10 },
  { code: "+34", country: "ES", fullName: "Spain", flag: "🇪🇸", length: 9 },
  { code: "+61", country: "AU", fullName: "Australia", flag: "🇦🇺", length: 9 },
  { code: "+7", country: "RU", fullName: "Russia", flag: "🇷🇺", length: 10 },
  { code: "+55", country: "BR", fullName: "Brazil", flag: "🇧🇷", length: 11 },
  { code: "+52", country: "MX", fullName: "Mexico", flag: "🇲🇽", length: 10 },
  { code: "+82", country: "KR", fullName: "South Korea", flag: "🇰🇷", length: 10 },
  { code: "+65", country: "SG", fullName: "Singapore", flag: "🇸🇬", length: 8 },
  { code: "+971", country: "AE", fullName: "United Arab Emirates", flag: "🇦🇪", length: 9 },
  { code: "+966", country: "SA", fullName: "Saudi Arabia", flag: "🇸🇦", length: 9 },
  { code: "+27", country: "ZA", fullName: "South Africa", flag: "🇿🇦", length: 9 },
  { code: "+31", country: "NL", fullName: "Netherlands", flag: "🇳🇱", length: 9 },
  { code: "+46", country: "SE", fullName: "Sweden", flag: "🇸🇪", length: 10 }];


export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSignUp = searchParams.get("mode") === "signup";

  const [authMethod, setAuthMethod] = useState("phone"); // "phone" or "email"
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    email: "",
    name: "",
    rememberMe: false
  });
  const [errors, setErrors] = useState({
    phone: "",
    email: "",
    name: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const redirectHandledRef = useRef(false);

  // Privacy Policy state
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyContent, setPrivacyContent] = useState("");
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);

  // Terms of Service state
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsContent, setTermsContent] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(false);

  // Fetch Privacy Policy
  const fetchPrivacyPolicy = async () => {
    try {
      setLoadingPrivacy(true);
      setShowPrivacyModal(true);
      const response = await api.get(API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC);
      if (response?.data?.success) {
        setPrivacyContent(response.data.data.content || "No privacy policy content available.");
      } else {
        setPrivacyContent("Failed to load privacy policy.");
      }
    } catch (err) {
      console.error("Error fetching privacy policy:", err);
      setPrivacyContent("Unable to load privacy policy at this time.");
    } finally {
      setLoadingPrivacy(false);
    }
  };

  // Fetch Terms of Service
  const fetchTermsOfService = async () => {
    try {
      setLoadingTerms(true);
      setShowTermsModal(true);
      const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC);
      if (response?.data?.success) {
        setTermsContent(response.data.data.content || "No terms of service content available.");
      } else {
        setTermsContent("Failed to load terms of service.");
      }
    } catch (err) {
      console.error("Error fetching terms of service:", err);
      setTermsContent("Unable to load terms of service at this time.");
    } finally {
      setLoadingTerms(false);
    }
  };

  // Helper function to process signed-in user
  const processSignedInUser = async (user, source = "unknown") => {
    if (redirectHandledRef.current) {

      return;
    }







    redirectHandledRef.current = true;
    setIsLoading(true);
    setApiError("");

    try {
      const idToken = await user.getIdToken();


      const response = await authAPI.firebaseGoogleLogin(idToken, "user");
      const data = response?.data?.data || {};







      const accessToken = data.accessToken;
      const appUser = data.user;

      if (accessToken && appUser) {
        setAuthData("user", accessToken, appUser);
        window.dispatchEvent(new Event("userAuthChanged"));

        // Clear any URL hash or params
        const hasHash = window.location.hash.length > 0;
        const hasQueryParams = window.location.search.length > 0;
        if (hasHash || hasQueryParams) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }


        navigate("/user", { replace: true });
      } else {
        console.error(`❌ Invalid backend response from ${source}`);
        redirectHandledRef.current = false;
        setIsLoading(false);
        setApiError("Invalid response from server. Please try again.");
      }
    } catch (error) {
      console.error(`❌ Error processing user from ${source}:`, error);
      console.error("Error details:", {
        code: error?.code,
        message: error?.message,
        response: error?.response?.data
      });
      redirectHandledRef.current = false;
      setIsLoading(false);

      let errorMessage = "Failed to complete sign-in. Please try again.";
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      setApiError(errorMessage);
    }
  };

  // Handle Firebase redirect result on component mount and URL changes
  useEffect(() => {
    // Prevent multiple calls
    if (redirectHandledRef.current) {
      return;
    }

    const handleRedirectResult = async () => {
      try {
        // Check if we're coming back from a redirect (URL might have hash or params)
        const currentUrl = window.location.href;
        const hasHash = window.location.hash.length > 0;
        const hasQueryParams = window.location.search.length > 0;










        const { getRedirectResult, onAuthStateChanged } = await import("firebase/auth");

        // Ensure Firebase is initialized
        ensureFirebaseInitialized();

        // Check current user immediately (before getRedirectResult)
        const immediateUser = firebaseAuth.currentUser;











        // First, try to get redirect result (non-blocking with timeout)
        // Note: getRedirectResult returns null if there's no redirect result (normal on first load)
        // We use a short timeout to avoid hanging, and rely on auth state listener as primary method
        let result = null;
        try {


          // Use a short timeout (3 seconds) - if it hangs, auth state listener will handle it
          result = await Promise.race([
            getRedirectResult(firebaseAuth),
            new Promise((resolve) =>
              setTimeout(() => {

                resolve(null);
              }, 3000)
            )]
          );






        } catch (redirectError) {


          // Don't throw - auth state listener will handle sign-in
          result = null;
        }









        if (result && result.user) {
          // Process redirect result
          await processSignedInUser(result.user, "redirect-result");
        } else {
          // No redirect result - check if user is already signed in
          const currentUser = firebaseAuth.currentUser;






          if (currentUser && !redirectHandledRef.current) {
            // Process current user
            await processSignedInUser(currentUser, "current-user-check");
          } else {
            // No redirect result - this is normal on first load

            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error("❌ Google sign-in redirect error:", error);
        console.error("Error details:", {
          code: error?.code,
          message: error?.message,
          stack: error?.stack
        });

        redirectHandledRef.current = false;

        // Show error to user
        const errorCode = error?.code || "";
        const errorMessage = error?.message || "";

        // Don't show error for "no redirect result" - this is normal when page first loads
        if (errorCode === "auth/no-auth-event" || errorCode === "auth/popup-closed-by-user") {
          // These are expected cases, don't show error

          setIsLoading(false);
          return;
        }

        // Handle backend errors (500, etc.)
        let message = "Google sign-in failed. Please try again.";

        if (error?.response) {
          // Axios error with response
          const status = error.response.status;
          const responseData = error.response.data || {};

          if (status === 500) {
            message = responseData.message || responseData.error || "Server error. Please try again later.";
          } else if (status === 400 || status === 401) {
            message = responseData.message || responseData.error || "Authentication failed. Please try again.";
          } else {
            message = responseData.message || responseData.error || errorMessage || message;
          }
        } else if (errorMessage) {
          message = errorMessage;
        } else if (errorCode) {
          // Firebase auth error codes
          if (errorCode === "auth/network-request-failed") {
            message = "Network error. Please check your connection and try again.";
          } else if (errorCode === "auth/invalid-credential") {
            message = "Invalid credentials. Please try again.";
          } else {
            message = errorMessage || message;
          }
        }

        setApiError(message);
        setIsLoading(false);
      }
    };

    // Helper function to process signed-in user
    const processSignedInUser = async (user, source = "unknown") => {
      if (redirectHandledRef.current) {

        return;
      }







      redirectHandledRef.current = true;
      setIsLoading(true);
      setApiError("");

      try {
        const idToken = await user.getIdToken();


        const response = await authAPI.firebaseGoogleLogin(idToken, "user");
        const data = response?.data?.data || {};







        const accessToken = data.accessToken;
        const appUser = data.user;

        if (accessToken && appUser) {
          setAuthData("user", accessToken, appUser);
          window.dispatchEvent(new Event("userAuthChanged"));

          // Clear any URL hash or params
          const hasHash = window.location.hash.length > 0;
          const hasQueryParams = window.location.search.length > 0;
          if (hasHash || hasQueryParams) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }


          navigate("/user", { replace: true });
        } else {
          console.error(`❌ Invalid backend response from ${source}`);
          redirectHandledRef.current = false;
          setIsLoading(false);
          setApiError("Invalid response from server. Please try again.");
        }
      } catch (error) {
        console.error(`❌ Error processing user from ${source}:`, error);
        console.error("Error details:", {
          code: error?.code,
          message: error?.message,
          response: error?.response?.data
        });
        redirectHandledRef.current = false;
        setIsLoading(false);

        let errorMessage = "Failed to complete sign-in. Please try again.";
        if (error?.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error?.message) {
          errorMessage = error.message;
        }
        setApiError(errorMessage);
      }
    };

    // Set up auth state listener FIRST (before getRedirectResult)
    // This ensures we catch auth state changes immediately
    let unsubscribe = null;
    const setupAuthListener = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth");
        ensureFirebaseInitialized();



        unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {







          // If user signed in and we haven't handled it yet
          if (user && !redirectHandledRef.current) {
            await processSignedInUser(user, "auth-state-listener");
          } else if (!user) {
            // User signed out

            redirectHandledRef.current = false;
          }


        });


      } catch (error) {
        console.error("❌ Error setting up auth state listener:", error);
      }
    };

    // Set up auth listener first, then check redirect result
    setupAuthListener();

    // Also check current user immediately (in case redirect already completed)
    const checkCurrentUser = async () => {
      try {
        ensureFirebaseInitialized();
        const currentUser = firebaseAuth.currentUser;
        if (currentUser && !redirectHandledRef.current) {

          await processSignedInUser(currentUser, "immediate-check");
        }
      } catch (error) {
        console.error("❌ Error checking current user:", error);
      }
    };

    // Check current user immediately
    checkCurrentUser();

    // Small delay to ensure Firebase is ready, then check redirect result
    const timer = setTimeout(() => {
      handleRedirectResult();
    }, 500);

    // Check for existing auth data in sessionStorage (to pre-fill when coming back from OTP)
    const storedData = sessionStorage.getItem("userAuthData");
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.method === "phone" && parsedData.phone) {
          // Split full phone (e.g. "+91 1234567890") into countryCode and number
          const parts = parsedData.phone.split(" ");
          if (parts.length >= 2) {
            setFormData(prev => ({
              ...prev,
              countryCode: parts[0],
              phone: parts[1],
              name: parsedData.name || prev.name
            }));
          }
          setAuthMethod("phone");
        } else if (parsedData.method === "email" && parsedData.email) {
          setFormData(prev => ({
            ...prev,
            email: parsedData.email,
            name: parsedData.name || prev.name
          }));
          setAuthMethod("email");
        }
      } catch (err) {
        console.error("Error parsing stored auth data:", err);
      }
    }

    return () => {
      clearTimeout(timer);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [navigate, searchParams]);

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find((c) => c.code === formData.countryCode) || countryCodes[2]; // Default to India (+91)

  const validateEmail = (email) => {
    if (!email.trim()) {
      return "Email is required";
    }
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(email.trim())) {
      return "Please enter a valid email address";
    }
    return "";
  };

  const validatePhone = (phone, isSubmit = false) => {
    if (!phone.trim()) {
      return isSubmit ? "Phone number is required" : "";
    }

    // Check if contains only digits (important to show "must contain only digits" error)
    if (/\D/.test(phone)) {
      return "Phone number must contain only digits";
    }

    const selectedCountry = countryCodes.find((c) => c.code === formData.countryCode) || countryCodes[2];
    const requiredLength = selectedCountry.length || 10;

    // Show error instantly if length EXCEEDS required length
    if (phone.length > requiredLength) {
      return `Phone number must be exactly ${requiredLength} digits for ${selectedCountry.fullName}`;
    }

    // Show "less than" error ONLY on submit
    if (isSubmit && phone.length < requiredLength) {
      return `Phone number must be exactly ${requiredLength} digits for ${selectedCountry.fullName}`;
    }

    return "";
  };

  const validateName = (name) => {
    if (!name.trim()) {
      return "Name is required";
    }
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters";
    }
    if (name.trim().length > 50) {
      return "Name must be less than 50 characters";
    }
    const nameRegex = /^[a-zA-Z\s'-]+$/;
    if (!nameRegex.test(name.trim())) {
      return "Name can only contain letters, spaces, hyphens, and apostrophes";
    }
    return "";
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // For phone field: strictly digits only in state, but show error for attempted non-digits
    if (name === "phone") {
      const numericValue = value.replace(/\D/g, "");
      // Real-time validation: pass false so "less than" error doesn't show yet
      const error = validatePhone(value, false);

      setFormData({
        ...formData,
        [name]: numericValue
      });

      setErrors({ ...errors, phone: error });
      return;
    }

    setFormData({
      ...formData,
      [name]: value
    });

    // Real-time validation
    if (name === "email") {
      setErrors({ ...errors, email: validateEmail(value) });
    } else if (name === "name") {
      setErrors({ ...errors, name: validateName(value) });
    }
  };

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError("");

    // Validate based on auth method
    let hasErrors = false;
    const newErrors = { phone: "", email: "", name: "" };

    if (authMethod === "phone") {
      const phoneError = validatePhone(formData.phone, true); // Pass true to show all errors on submit
      newErrors.phone = phoneError;
      if (phoneError) hasErrors = true;
    } else {
      const emailError = validateEmail(formData.email);
      newErrors.email = emailError;
      if (emailError) hasErrors = true;
    }

    // Validate name for sign up
    if (isSignUp) {
      const nameError = validateName(formData.name);
      newErrors.name = nameError;
      if (nameError) hasErrors = true;
    }

    setErrors(newErrors);

    if (hasErrors) {
      setIsLoading(false);
      return;
    }

    try {
      const purpose = isSignUp ? "register" : "login";
      const fullPhone = authMethod === "phone" ? `${formData.countryCode} ${formData.phone}`.trim() : null;
      const email = authMethod === "email" ? formData.email.trim() : null;

      // Call backend to send OTP
      await authAPI.sendOTP(fullPhone, purpose, email);

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: authMethod,
        phone: fullPhone,
        email: email,
        name: isSignUp ? formData.name.trim() : null,
        isSignUp,
        module: "user"
      };
      sessionStorage.setItem("userAuthData", JSON.stringify(authData));

      // Navigate to OTP page
      navigate("/user/auth/otp");
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again.";
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setApiError("");
    setIsLoading(true);
    redirectHandledRef.current = false; // Reset flag when starting new sign-in

    try {
      // Ensure Firebase is initialized before use
      ensureFirebaseInitialized();

      // Validate Firebase Auth instance
      if (!firebaseAuth) {
        throw new Error("Firebase Auth is not initialized. Please check your Firebase configuration.");
      }

      const { signInWithRedirect } = await import("firebase/auth");

      // Log current origin for debugging






      // Use redirect directly to avoid COOP issues
      // The redirect result will be handled by the useEffect hook above
      await signInWithRedirect(firebaseAuth, googleProvider);

      // Note: signInWithRedirect will cause a full page redirect to Google
      // After user authenticates, they'll be redirected back to this page
      // The useEffect hook will handle the result when the page loads again

      // Don't set loading to false here - page will redirect
    } catch (error) {
      console.error("❌ Google sign-in redirect error:", error);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
      setIsLoading(false);
      redirectHandledRef.current = false;

      const errorCode = error?.code || "";
      const errorMessage = error?.message || "";

      let message = "Google sign-in failed. Please try again.";

      if (errorCode === "auth/configuration-not-found") {
        message = "Firebase configuration error. Please ensure your domain is authorized in Firebase Console. Current domain: " + window.location.hostname;
      } else if (errorCode === "auth/popup-blocked") {
        message = "Popup was blocked. Please allow popups and try again.";
      } else if (errorCode === "auth/popup-closed-by-user") {
        message = "Sign-in was cancelled. Please try again.";
      } else if (errorCode === "auth/network-request-failed") {
        message = "Network error. Please check your connection and try again.";
      } else if (errorMessage) {
        message = errorMessage;
      } else if (error?.response?.data?.message) {
        message = error.response.data.message;
      } else if (error?.response?.data?.error) {
        message = error.response.data.error;
      }

      setApiError(message);
    }
  };

  const toggleMode = () => {
    const newMode = isSignUp ? "signin" : "signup";
    navigate(`/user/auth/sign-in?mode=${newMode}`, { replace: true });
    // Reset form
    setFormData({ phone: "", countryCode: "+91", email: "", name: "", rememberMe: false });
    setErrors({ phone: "", email: "", name: "" });
  };

  const handleLoginMethodChange = () => {
    setAuthMethod(authMethod === "email" ? "phone" : "email");
  };

  return (
    <AnimatedPage className="min-h-screen flex flex-col bg-white dark:bg-[#0a0a0a] !pb-0 md:flex-row">

      {/* Mobile: Top Section - Banner Image */}
      <div className="relative md:hidden w-full shrink-0 bg-[#cb202d]" style={{ height: "42vh", minHeight: "320px" }}>
        <img
          src={loginBanner}
          alt="Food Banner"
          className="w-full h-full object-cover object-center" />

      </div>

      <div className="relative hidden md:block w-full shrink-0 md:w-1/2 md:h-screen md:sticky md:top-0">
        <img
          src={loginBanner}
          alt="Food Banner"
          className="w-full h-full object-cover object-center" />

        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-transparent" />
      </div>

      {/* Mobile: Bottom Section - White Login Form with Premium Overlap */}
      {/* Desktop: Right Section - Login Form */}
      <div className="bg-white dark:bg-[#1a1a1a] -mt-10 rounded-t-[2.5rem] md:rounded-t-none relative z-10 p-5 sm:p-6 md:p-8 lg:p-10 md:w-1/2 md:flex md:items-center md:justify-center md:min-h-screen">
        <div className="max-w-md lg:max-w-lg xl:max-w-xl mx-auto space-y-6 md:space-y-8 lg:space-y-10 w-full pt-2 md:pt-0">
          {/* Heading */}
          <div className="text-center space-y-2 md:space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white leading-tight">
              India's #1 Food Delivery and Dining App
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-400">
              Log in or sign up
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
            {/* Name field for sign up - hidden by default, shown only when needed */}
            {isSignUp &&
              <div className="space-y-2">
                <Input
                  id="name"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`text-base md:text-lg h-12 md:h-14 bg-white dark:bg-[#1a1a1a] text-black dark:text-white ${errors.name ? "border-red-500" : "border-gray-300 dark:border-gray-700"} transition-colors`}
                  aria-invalid={errors.name ? "true" : "false"} />

                {errors.name &&
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.name}</span>
                  </div>
                }
              </div>
            }

            {/* Phone Number Input */}
            {authMethod === "phone" &&
              <div className="space-y-2">
                <div className="flex gap-2 items-stretch">
                  <Select
                    value={formData.countryCode}
                    onValueChange={handleCountryCodeChange}>

                    <SelectTrigger className="w-[100px] md:w-[120px] !h-12 md:!h-14 border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-black dark:text-white rounded-lg flex items-center transition-colors" size="default">
                      <SelectValue>
                        <span className="flex items-center gap-2 text-sm md:text-base">
                          <span>{selectedCountry.flag}</span>
                          <span>{selectedCountry.code}</span>
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      {countryCodes.map((country) =>
                        <SelectItem key={country.code} value={country.code}>
                          <span className="flex items-center gap-2">
                            <span>{country.flag}</span>
                            <span>{country.code}</span>
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Enter Phone Number"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`flex-1 h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.phone ? "border-red-500" : ""} transition-colors`}
                    aria-invalid={errors.phone ? "true" : "false"} />

                </div>
                {errors.phone &&
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone}</span>
                  </div>
                }
                {apiError && authMethod === "phone" &&
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                }
              </div>
            }

            {/* Email Input */}
            {authMethod === "email" &&
              <div className="space-y-2">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.email ? "border-red-500" : ""} transition-colors`}
                  aria-invalid={errors.email ? "true" : "false"} />

                {errors.email &&
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.email}</span>
                  </div>
                }
                {apiError && authMethod === "email" &&
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                }
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod("phone");
                    setApiError("");
                  }}
                  className="text-xs text-[#E23744] hover:underline text-left">

                  Use phone instead
                </button>
              </div>
            }

            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="rememberMe"
                checked={formData.rememberMe}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, rememberMe: checked })
                }
                className="w-4 h-4 border-2 border-gray-300 rounded data-[state=checked]:bg-[#E23744] data-[state=checked]:border-[#E23744] flex items-center justify-center" />

              <label
                htmlFor="rememberMe"
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">

                Remember my login for faster sign-in
              </label>
            </div>

            {/* Continue Button */}
            <Button
              type="submit"
              className="w-full h-12 md:h-14 bg-[#E23744] hover:bg-[#d32f3d] text-white font-bold text-base md:text-lg rounded-lg transition-all hover:shadow-lg active:scale-[0.98]"
              disabled={isLoading}>

              {isLoading ?
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Signing In..."}
                </> :

                "Continue"
              }
            </Button>
          </form>

          {/* Or Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#1a1a1a] px-2 text-sm text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          {/* Social Login Icons */}
          <div className="flex justify-center gap-4 md:gap-6">
            {/* Google Login */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:shadow-md active:scale-95"
              aria-label="Sign in with Google">

              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />

                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />

                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />

                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />

              </svg>
            </button>

            {/* Email Login */}
            <button
              type="button"
              onClick={handleLoginMethodChange}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-[#E23744] flex items-center justify-center hover:bg-[#d32f3d] transition-all hover:shadow-md active:scale-95 bg-[#E23744]"
              aria-label="Sign in with Email">

              {authMethod == "phone" ? <Mail className="h-5 w-5 md:h-6 md:w-6 text-white" /> : <Phone className="h-5 w-5 md:h-6 md:w-6 text-white" />}
            </button>
          </div>

          {/* Legal Disclaimer */}
          <div className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-400 pt-4 md:pt-6">
            <p className="mb-1 md:mb-2">
              By continuing, you agree to our
            </p>
            <div className="flex justify-center gap-2 flex-wrap text-black dark:text-white">
              <span onClick={fetchTermsOfService} className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer">Terms of Service</span>
              <span className="text-gray-500">•</span>
              <span onClick={fetchPrivacyPolicy} className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer">Privacy Policy</span>
              <span className="text-gray-500">•</span>
              <a href="#" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Content Policy</a>
            </div>
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
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg max-h-[85vh] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden"
            >
              <div className="relative flex items-center justify-center p-4 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-[#1a1a1a]">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center pointer-events-none">Privacy Policy</h2>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="absolute right-4 p-2 bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-all group z-10 cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-700 dark:text-gray-300 group-hover:text-red-500 transition-colors" />
                </button>
              </div>

              <div className="p-4 pt-2 overflow-y-auto flex-1 bg-white dark:bg-[#1a1a1a]">
                {loadingPrivacy ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-800 border-t-black dark:border-t-white rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading privacy policy...</p>
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 space-y-3 font-medium leading-relaxed"
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
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg max-h-[85vh] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden"
            >
              <div className="relative flex items-center justify-center p-4 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-[#1a1a1a]">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center pointer-events-none">Terms of Service</h2>
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="absolute right-4 p-2 bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-all group z-10 cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-700 dark:text-gray-300 group-hover:text-red-500 transition-colors" />
                </button>
              </div>

              <div className="p-4 pt-2 overflow-y-auto flex-1 bg-white dark:bg-[#1a1a1a]">
                {loadingTerms ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-800 border-t-black dark:border-t-white rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading terms of service...</p>
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 space-y-3 font-medium leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: termsContent }}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatedPage>);

}