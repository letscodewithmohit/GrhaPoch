import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X, Pencil, Loader2, Camera, Image as ImageIcon, RefreshCw, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "../../context/ProfileContext";
import { userAPI } from "@/lib/api";
import { toast } from "sonner";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

// Gender options
const genderOptions = [
{ value: "male", label: "Male" },
{ value: "female", label: "Female" },
{ value: "other", label: "Other" },
{ value: "prefer-not-to-say", label: "Prefer not to say" }];


// Load profile data from localStorage
const loadProfileFromStorage = () => {
  try {
    const stored = localStorage.getItem('userProfile') || localStorage.getItem('user_user') || localStorage.getItem('appzeto_user_profile');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading profile from localStorage:', error);
  }
  return null;
};

// Save profile data to localStorage
const saveProfileToStorage = (data) => {
  try {
    const stringifiedData = JSON.stringify(data);
    localStorage.setItem('appzeto_user_profile', stringifiedData);
    localStorage.setItem('userProfile', stringifiedData);
    localStorage.setItem('user_user', stringifiedData);
  } catch (error) {
    console.error('Error saving profile to localStorage:', error);
  }
};

export default function EditProfile() {
  const navigate = useNavigate();
  const { userProfile, updateUserProfile } = useProfile();

  // Load from localStorage or use context
  const storedProfile = loadProfileFromStorage();
  const initialProfile = storedProfile || userProfile || {};

  const initialFormData = {
    name: initialProfile.name ?? "",
    mobile: initialProfile.mobile ?? initialProfile.phone ?? "",
    email: initialProfile.email ?? "",
    dateOfBirth: initialProfile.dateOfBirth ?
    typeof initialProfile.dateOfBirth === 'string' ?
    dayjs(initialProfile.dateOfBirth) :
    dayjs(initialProfile.dateOfBirth) :
    null,
    anniversary: initialProfile.anniversary ?
    typeof initialProfile.anniversary === 'string' ?
    dayjs(initialProfile.anniversary) :
    dayjs(initialProfile.anniversary) :
    null,
    gender: initialProfile.gender ?? ""
  };

  const [formData, setFormData] = useState(initialFormData);
  // Separate session initial state to track changes accurately
  const [sessionInitialData] = useState(initialFormData);
  const [sessionInitialImage] = useState(initialProfile?.profileImage || null);
  
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [profileImage, setProfileImage] = useState(initialProfile?.profileImage || null);
  const [imagePreview, setImagePreview] = useState(initialProfile?.profileImage || null);
  const [isSourcePopupOpen, setIsSourcePopupOpen] = useState(false);
  const fileInputRef = useRef(null);
  const uploadPromiseRef = useRef(null);
  
  const [activeCamera, setActiveCamera] = useState(null);
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

  // Lock body scroll when camera is active
  useEffect(() => {
    if (activeCamera) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeCamera]);

  // Update form data when profile changes (only if no local changes exist)
  useEffect(() => {
    if (!hasChanges) {
      const storedProfile = loadProfileFromStorage();
      const profile = storedProfile || userProfile || {};
      const newFormData = {
        name: profile.name ?? "",
        mobile: profile.mobile ?? profile.phone ?? "",
        email: profile.email ?? "",
        dateOfBirth: profile.dateOfBirth ?
        typeof profile.dateOfBirth === 'string' ?
        dayjs(profile.dateOfBirth) :
        dayjs(profile.dateOfBirth) :
        null,
        anniversary: profile.anniversary ?
        typeof profile.anniversary === 'string' ?
        dayjs(profile.anniversary) :
        dayjs(profile.anniversary) :
        null,
        gender: profile.gender ?? ""
      };
      setFormData(newFormData);

      // Update image states to match profile data
      setProfileImage(profile.profileImage || null);
      setImagePreview(profile.profileImage || null);
    }
  }, [userProfile]); // Only react to external profile changes
  
  // Check for multiple cameras on mount
  useEffect(() => {
    const checkCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      } catch (err) {
        console.error("Error checking cameras:", err);
      }
    };
    checkCameras();
  }, []);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const startCamera = async () => {
    stopCamera();
    try {
      const constraints = {
        video: { facingMode: facingMode },
        audio: false
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
    } catch (err) {
      console.warn(`Failed to start camera with ${facingMode}, trying generic:`, err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(fallbackStream);
      } catch (fallbackErr) {
        console.error("Critical camera error:", fallbackErr);
        toast.error("Could not access camera. Please check permissions.");
        setActiveCamera(null);
      }
    }
  };

  useEffect(() => {
    if (stream && videoRef.current && !capturedImage) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error("Error playing video:", e));
    }
  }, [stream, capturedImage]);

  useEffect(() => {
    if (activeCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeCamera, facingMode]);

  const resizeImage = (dataUrl, maxWidth = 800) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = dataUrl;
    });
  };

  const toggleFacingMode = () => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    setCapturedImage(null);
  };

  const takePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      
      // Flip context if in user mode to match the preview
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImage(dataUrl);
    }
  };

  const usePhoto = async () => {
    if (capturedImage) {
      try {
        // Resize and Compress background image before upload
        const optimizedImage = await resizeImage(capturedImage);
        
        // Instant UI Feedback - close modal and show local preview immediately
        setImagePreview(optimizedImage);
        setActiveCamera(null);
        
        const res = await fetch(optimizedImage);
        const blob = await res.blob();
        const file = new File([blob], `profile_${Date.now()}.jpg`, { type: "image/jpeg" });
        
        // Background Upload to get server URL, but DON'T update DB yet
        uploadPromiseRef.current = handleImageSelect({ target: { files: [file] } }, true);
        setCapturedImage(null);
      } catch (error) {
        console.error("Error using photo:", error);
        toast.error("Failed to process photo");
        // Revert UI on error
        setImagePreview(profileImage);
      }
    }
  };

  const handleRemoveImage = async () => {
    // LOCAL ONLY - Don't call API until "Update Profile"
    try {
      // Instant UI update
      setProfileImage(null);
      setImagePreview(null);
      setIsSourcePopupOpen(false);
      
      // Removed toaster as per user request
    } catch (error) {
      console.error('Error removing image locally:', error);
    }
  };

  // Get avatar initial dynamically from form or profile
  const avatarInitial = (formData.name || initialProfile.name || "U").trim().charAt(0).toUpperCase();

  // Check if form or image has changes against session start
  useEffect(() => {
    const currentData = JSON.stringify(formData);
    const savedData = JSON.stringify(sessionInitialData);
    const formChanged = currentData !== savedData;
    const imageChanged = profileImage !== sessionInitialImage;
    setHasChanges(formChanged || imageChanged);
  }, [formData, sessionInitialData, profileImage, sessionInitialImage]);

  const handleBackNavigation = () => {
    if (hasChanges) {
      setIsDiscardDialogOpen(true);
    } else {
      navigate(-1);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleClear = (field) => {
    setFormData((prev) => ({
      ...prev,
      [field]: ""
    }));
  };

  const handleImageSelect = async (e, isFromCamera = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    // Show preview instantly
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    // Upload to server to get URL, but DON'T update user record yet
    const uploadTask = async () => {
      try {
        setIsUploadingImage(true);
        const response = await userAPI.uploadProfileImage(file);
        const imageUrl = response?.data?.data?.profileImage || response?.data?.profileImage;

        if (imageUrl) {
          // Just update local states. Persistence happens in handleUpdate.
          setProfileImage(imageUrl);
          setImagePreview(imageUrl); // Keep showing the server URL now
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        toast.error(error?.response?.data?.message || 'Failed to obtain server URL for image');
        // Revert preview to previous valid image
        setImagePreview(profileImage);
      } finally {
        setIsUploadingImage(false);
        setIsSourcePopupOpen(false);
      }
    };

    uploadPromiseRef.current = uploadTask();
    return uploadPromiseRef.current;
  };

  const handleUpdate = async () => {
    if (isSaving) return;

    try {
      setIsSaving(true);
      
      // Ensure any background image upload is finished
      if (uploadPromiseRef.current) {
        await uploadPromiseRef.current;
      }

      // Prepare data for API
      const updateData = {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.mobile || undefined,
        dateOfBirth: formData.dateOfBirth ? formData.dateOfBirth.format('YYYY-MM-DD') : undefined,
        anniversary: formData.anniversary ? formData.anniversary.format('YYYY-MM-DD') : undefined,
        gender: formData.gender || undefined,
        profileImage: profileImage || null // Explicitly send null to clear from DB
      };

      // Call API to update profile
      const response = await userAPI.updateProfile(updateData);
      const updatedUser = response?.data?.data?.user || response?.data?.user;

      if (updatedUser) {
        // Update context with all fields including profileImage
        updateUserProfile({
          ...updatedUser,
          phone: updatedUser.phone || formData.mobile,
          profileImage: updatedUser.hasOwnProperty('profileImage') ? updatedUser.profileImage : profileImage
        });

        // Unified save to all localStorage keys
        saveProfileToStorage({
          ...updatedUser,
          name: updatedUser.name || formData.name,
          phone: updatedUser.phone || formData.mobile,
          email: updatedUser.email || formData.email,
          profileImage: updatedUser.hasOwnProperty('profileImage') ? updatedUser.profileImage : profileImage,
          dateOfBirth: updatedUser.dateOfBirth || formData.dateOfBirth?.format('YYYY-MM-DD'),
          anniversary: updatedUser.anniversary || formData.anniversary?.format('YYYY-MM-DD'),
          gender: updatedUser.gender || formData.gender
        });

        // Dispatch event to refresh profile from API
        window.dispatchEvent(new Event("userAuthChanged"));

        toast.success('Profile updated successfully', { duration: 2000 });

        // Navigate back
        navigate("/user/profile");
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error?.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMobileChange = () => {


  };

  const handleEmailChange = () => {


  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] overflow-x-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 md:py-5 lg:py-6">
          <button
            onClick={handleBackNavigation}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0">
            
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-white" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Your Profile</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-10 lg:py-12 space-y-6 md:space-y-8 lg:space-y-10">
        {/* Avatar Section */}
        <div className="flex justify-center">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-white dark:border-gray-800 shadow-md bg-transparent overflow-hidden relative">
              <AnimatePresence mode="wait">
                {imagePreview && imagePreview !== 'null' && imagePreview !== 'undefined' ? (
                  <motion.div
                    key="image"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                  >
                    <AvatarImage
                      src={typeof imagePreview === 'string' ? imagePreview.trim() : imagePreview}
                      className="object-cover w-full h-full"
                      alt={formData.name || 'User'} 
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="initials"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center w-full h-full bg-blue-500 text-white text-3xl font-bold uppercase select-none"
                  >
                    {avatarInitial}
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Center Loading Overlay */}
              <AnimatePresence>
                {isUploadingImage && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center z-10"
                  >
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Avatar>
            {/* Edit Icon */}
            <button
              onClick={() => setIsSourcePopupOpen(true)}
              disabled={isUploadingImage}
              className="absolute bottom-0 right-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-20">
              
              <Pencil className="h-4 w-4 text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden" />
            
          </div>
        </div>

        {/* Camera Modal */}
        {activeCamera && (
          <div className="fixed inset-0 z-[1000] flex flex-col bg-black overflow-hidden h-screen h-[100dvh] w-screen m-0 p-0 border-0 outline-none">
            <div className="flex-shrink-0 flex items-center justify-between p-4 text-white z-[1001] bg-gradient-to-b from-black/80 to-transparent">
              <h3 className="text-lg font-medium">Take Photo</h3>
              <div className="flex items-center gap-2">
                {hasMultipleCameras && !capturedImage && (
                  <button
                    onClick={toggleFacingMode}
                    className="p-3 hover:bg-white/20 rounded-full transition-colors active:bg-white/30"
                    title="Switch Camera"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </button>
                )}
                <button onClick={() => { setActiveCamera(null); setCapturedImage(null); }} className="p-2">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
              {capturedImage ? (
                <img
                  src={capturedImage}
                  className="w-full h-full object-contain"
                  alt="Captured"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover sm:object-contain ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />
              )}
            </div>

            <div className="flex-shrink-0 p-8 pb-12 bg-black flex items-center justify-center gap-6 border-0 m-0">
              {capturedImage ? (
                <>
                  <button
                    onClick={() => setCapturedImage(null)}
                    className="flex flex-col items-center gap-2 text-white"
                  >
                    <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
                      <X className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-white/80">Retake</span>
                  </button>
                  <button
                    onClick={usePhoto}
                    className="flex flex-col items-center gap-2 text-white"
                  >
                    <div className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center hover:bg-green-700 transition-colors shadow-lg shadow-green-900/40">
                      <Check className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-white/80">Use Photo</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={takePhoto}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-20 h-20 rounded-full border-[3px] border-white flex items-center justify-center p-1.5 transition-transform group-active:scale-95 group-hover:scale-105">
                    <div className="w-full h-full rounded-full bg-white shadow-inner"></div>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Image Source Selection Popup */}
        <Dialog open={isSourcePopupOpen} onOpenChange={setIsSourcePopupOpen}>
          <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white text-center">
                Change Profile Photo
              </DialogTitle>
            </DialogHeader>
            <div className="p-6 pt-2 space-y-4">
              <button
                onClick={() => {
                  setActiveCamera('profile');
                  setIsSourcePopupOpen(false);
                }}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all border border-gray-100 dark:border-gray-800 group"
              >
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                  <Camera className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <div className="text-left">
                  <div className="text-base font-semibold text-gray-900 dark:text-white">Camera</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Take a new photo</div>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all border border-gray-100 dark:border-gray-800 group"
              >
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center group-hover:bg-green-600 transition-colors">
                  <ImageIcon className="h-6 w-6 text-green-600 group-hover:text-white transition-colors" />
                </div>
                <div className="text-left">
                  <div className="text-base font-semibold text-gray-900 dark:text-white">Files & Gallery</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Choose from your photos</div>
                </div>
              </button>

              {profileImage && (
                <button
                  onClick={handleRemoveImage}
                  disabled={isUploadingImage}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-all border border-gray-100 dark:border-gray-800 group"
                >
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center group-hover:bg-red-600 transition-colors">
                    <Trash2 className="h-6 w-6 text-red-600 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-left">
                    <div className="text-base font-semibold text-red-600">Remove Photo</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Clear current picture</div>
                  </div>
                </button>
              )}
              
              <Button 
                variant="ghost" 
                onClick={() => setIsSourcePopupOpen(false)}
                className="w-full h-12 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discard Changes Confirmation */}
        <Dialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
          <DialogContent className="sm:max-w-[360px] p-6 rounded-2xl border-0 shadow-2xl bg-white dark:bg-[#1a1a1a]">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto text-red-600">
                <Trash2 className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Discard Changes?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  You have unsaved changes. Are you sure you want to discard them and go back?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDiscardDialogOpen(false)}
                  className="h-12 rounded-xl border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold"
                >
                  No
                </Button>
                <Button 
                  onClick={() => {
                    setIsDiscardDialogOpen(false);
                    navigate(-1);
                  }}
                  className="h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  Yes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Form Card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-4 md:space-y-5 lg:space-y-6">
            {/* Name Field */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-white">
                Name
              </Label>
              <div className="relative">
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="pr-10 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Name" />
                
                {formData.name &&
                <button
                  type="button"
                  onClick={() => handleClear('name')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                  
                    <X className="h-5 w-5" />
                  </button>
                }
              </div>
            </div>

            {/* Mobile Field */}
            <div className="space-y-1.5">
              <Label htmlFor="mobile" className="text-sm font-medium text-gray-700 dark:text-white">
                Mobile
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mobile"
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
                  className="flex-1 h-12 text-base  border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Mobile" />
                
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-white">
                Email
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="flex-1 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Email" />
                
              </div>
            </div>

            {/* Date of Birth Field */}
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth" className="text-sm font-medium text-gray-700 dark:text-white">
                Date of birth
              </Label>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  value={formData.dateOfBirth}
                  onChange={(newValue) => handleChange('dateOfBirth', newValue)}
                  slotProps={{
                    textField: {
                      className: "w-full",
                      sx: {
                        '& .MuiOutlinedInput-root': {
                          height: '48px',
                          borderRadius: '8px',
                          '& fieldset': {
                            borderColor: '#d1d5db'
                          },
                          '&:hover fieldset': {
                            borderColor: '#9ca3af'
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#16a34a',
                            borderWidth: '1px'
                          }
                        },
                        '& .MuiInputBase-input': {
                          padding: '12px 14px',
                          fontSize: '16px'
                        }
                      }
                    }
                  }} />
                
              </LocalizationProvider>
            </div>

            {/* Anniversary Field */}
            <div className="space-y-1.5">
              <Label htmlFor="anniversary" className="text-sm font-medium text-gray-700 dark:text-white">
                Anniversary <span className="text-gray-400 dark:text-gray-500 font-normal">(Optional)</span>
              </Label>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  value={formData.anniversary}
                  onChange={(newValue) => handleChange('anniversary', newValue)}
                  slotProps={{
                    textField: {
                      className: "w-full",
                      sx: {
                        '& .MuiOutlinedInput-root': {
                          height: '48px',
                          borderRadius: '8px',
                          '& fieldset': {
                            borderColor: '#d1d5db'
                          },
                          '&:hover fieldset': {
                            borderColor: '#9ca3af'
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#16a34a',
                            borderWidth: '1px'
                          }
                        },
                        '& .MuiInputBase-input': {
                          padding: '12px 14px',
                          fontSize: '16px'
                        }
                      }
                    }
                  }} />
                
              </LocalizationProvider>
            </div>

            {/* Gender Field */}
            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-sm font-medium text-gray-700 dark:text-white">
                Gender
              </Label>
              <Select
                value={formData.gender || ""}
                onValueChange={(value) => handleChange('gender', value)}>
                
                <SelectTrigger className="h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  {genderOptions.map((option) =>
                  <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Update Profile Button */}
        <Button
          onClick={handleUpdate}
          disabled={!hasChanges || isSaving || isUploadingImage}
          className={`w-full h-14 rounded-xl font-semibold text-base transition-all ${
          hasChanges && !isSaving && !isUploadingImage ?
          'bg-green-600 hover:bg-green-700 text-white' :
          'bg-gray-200 text-gray-400 cursor-not-allowed'}`
          }>
          
          {isSaving ?
          <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Saving...
            </> :

          'Update profile'
          }
        </Button>
      </div>
    </div>);

}