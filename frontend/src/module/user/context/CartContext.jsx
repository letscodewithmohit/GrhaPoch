// src/context/cart-context.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"

// Default cart context value to prevent errors during initial render
const defaultCartContext = {
  _isProvider: false, // Flag to identify if this is from the actual provider
  cart: [],
  items: [],
  itemCount: 0,
  total: 0,
  cartConflict: null,
  resolveCartConflict: () => {
    console.warn('CartProvider not available - resolveCartConflict called');
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
    console.warn('CartProvider not available - clearCart called');
  },
  cleanCartForRestaurant: () => {
    console.warn('CartProvider not available - cleanCartForRestaurant called');
  },
}

const CartContext = createContext(defaultCartContext)

export function CartProvider({ children }) {
  // Safe init (works with SSR and bad JSON)
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("cart")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Track last add event for animation
  const [lastAddEvent, setLastAddEvent] = useState(null)
  // Track last remove event for animation
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null)

  // Track cart conflict (different restaurant item attempted)
  const [cartConflict, setCartConflict] = useState(null) // { existingRestaurant, newRestaurant, pendingItem }
  const pendingItemRef = useRef(null) // Stores the item that caused the conflict

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cart))
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [cart])

  const addToCart = (item, sourcePosition = null, quantity = 1) => {
    const newItemRestaurantId = String(item?.restaurantId || "");
    const newItemRestaurantName = item?.restaurant || "";

    // Normalize restaurant names for comparison (trim and case-insensitive)
    const normalizeName = (name) => name ? String(name).trim().toLowerCase() : '';
    const newRestaurantNameNormalized = normalizeName(newItemRestaurantName);

    const addQuantity = Math.max(1, quantity);

    // 1. CRITICAL: Validate restaurant consistency BEFORE updating state
    // This prevents "throw" inside state updaters which causing blank page crashes
    if (cart.length > 0) {
      const firstItemRestaurantId = String(cart[0]?.restaurantId || "");
      const firstItemRestaurantName = cart[0]?.restaurant || "";
      const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName);

      // Check for mismatch
      const isNameMismatch = firstRestaurantNameNormalized && newRestaurantNameNormalized &&
        firstRestaurantNameNormalized !== newRestaurantNameNormalized;
      const isIdMismatch = !isNameMismatch && firstItemRestaurantId && newItemRestaurantId &&
        firstItemRestaurantId !== newItemRestaurantId;

      if (isNameMismatch || isIdMismatch) {
        // Store conflict info and pending item — DO NOT use browser confirm, use app state
        pendingItemRef.current = { item, sourcePosition, quantity: addQuantity };

        setCartConflict({
          existingRestaurant: firstItemRestaurantName || 'Current Restaurant',
          newRestaurant: newItemRestaurantName || 'New Restaurant',
        });

        return false; // Conflict detected, not added yet
      }
    }

    // 2. Regular Add/Update Logic
    setCart((prev) => {
      const itemIdStr = String(item.id);
      const existing = prev.find((i) => String(i.id) === itemIdStr);

      if (existing) {
        if (sourcePosition) {
          setLastAddEvent({
            product: { id: existing.id, name: existing.name, imageUrl: existing.image || existing.imageUrl },
            sourcePosition
          });
          setTimeout(() => setLastAddEvent(null), 1500);
        }
        return prev.map((i) => String(i.id) === itemIdStr ? { ...i, quantity: i.quantity + addQuantity } : i);
      }

      // Validate item has required restaurant info (safety check)
      if (!newItemRestaurantId && !newItemRestaurantName) {
        console.error('❌ Cannot add item: Missing restaurant information!', item);
        return prev; // Return unchanged
      }

      const newItem = { ...item, quantity: addQuantity };

      // Set last add event for animation if sourcePosition is provided
      if (sourcePosition) {
        setLastAddEvent({
          product: {
            id: item.id,
            name: item.name,
            imageUrl: item.image || item.imageUrl,
          },
          sourcePosition,
        });
        setTimeout(() => setLastAddEvent(null), 1500);
      }

      return [...prev, newItem];
    });

    return true; // Success
  }

  // Resolve the cart conflict:
  // replace=true  → clear cart and add the pending item
  // replace=false → cancel (discard the pending item)
  const resolveCartConflict = (replace) => {
    const pending = pendingItemRef.current;
    setCartConflict(null);
    pendingItemRef.current = null;

    if (replace && pending) {
      // Clear cart and add the pending item
      const newItem = { ...pending.item, quantity: pending.quantity || 1 };
      setCart([newItem]);

      // Optionally show animation
      if (pending.sourcePosition) {
        setLastAddEvent({
          product: {
            id: pending.item.id,
            name: pending.item.name,
            imageUrl: pending.item.image || pending.item.imageUrl
          },
          sourcePosition: pending.sourcePosition
        });
        setTimeout(() => setLastAddEvent(null), 1500);
      }
    }
  }

  const removeFromCart = (itemId, sourcePosition = null, productInfo = null) => {
    setCart((prev) => {
      const itemToRemove = prev.find((i) => i.id === itemId)
      if (itemToRemove && sourcePosition && productInfo) {
        // Set last remove event for animation
        setLastRemoveEvent({
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
          },
          sourcePosition,
        })
        // Clear after animation completes
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      const itemIdStr = String(itemId);
      return prev.filter((i) => String(i.id) !== itemIdStr)
    })
  }

  const updateQuantity = (itemId, quantity, sourcePosition = null, productInfo = null) => {
    const itemIdStr = String(itemId);
    if (quantity <= 0) {
      setCart((prev) => {
        const itemToRemove = prev.find((i) => String(i.id) === itemIdStr)
        if (itemToRemove && sourcePosition && productInfo) {
          // Set last remove event for animation
          setLastRemoveEvent({
            product: {
              id: productInfo.id || itemToRemove.id,
              name: productInfo.name || itemToRemove.name,
              imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
            },
            sourcePosition,
          })
          // Clear after animation completes
          setTimeout(() => setLastRemoveEvent(null), 1500)
        }
        return prev.filter((i) => String(i.id) !== itemIdStr)
      })
      return
    }

    // When quantity decreases (but not to 0), also trigger removal animation
    setCart((prev) => {
      const existingItem = prev.find((i) => String(i.id) === itemIdStr)
      if (existingItem && quantity < existingItem.quantity && sourcePosition && productInfo) {
        // Set last remove event for animation when decreasing quantity
        setLastRemoveEvent({
          product: {
            id: productInfo.id || existingItem.id,
            name: productInfo.name || existingItem.name,
            imageUrl: productInfo.imageUrl || productInfo.image || existingItem.image || existingItem.imageUrl,
          },
          sourcePosition,
        })
        // Clear after animation completes
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return prev.map((i) => (String(i.id) === itemIdStr ? { ...i, quantity } : i))
    })
  }

  const getCartCount = () =>
    cart.reduce((total, item) => total + (item.quantity || 0), 0)

  const isInCart = (itemId) => {
    const idStr = String(itemId);
    return cart.some((i) => String(i.id) === idStr);
  }

  const getCartItem = (itemId) => {
    const idStr = String(itemId);
    return cart.find((i) => String(i.id) === idStr);
  }

  const clearCart = () => setCart([])

  // Clean cart to remove items from different restaurants
  // Keeps only items from the specified restaurant
  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    setCart((prev) => {
      if (prev.length === 0) return prev;

      // Normalize restaurant name for comparison
      const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
      const targetRestaurantNameNormalized = normalizeName(restaurantName);

      // Filter cart to keep only items from the target restaurant
      const cleanedCart = prev.filter((item) => {
        const itemRestaurantId = item?.restaurantId;
        const itemRestaurantName = item?.restaurant;
        const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);

        // Check by restaurant name first (more reliable)
        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized;
        }
        // Fallback to ID comparison
        if (restaurantId && itemRestaurantId) {
          return itemRestaurantId === restaurantId ||
            itemRestaurantId === restaurantId.toString() ||
            itemRestaurantId.toString() === restaurantId;
        }
        // If no match, remove item
        return false;
      });

      if (cleanedCart.length !== prev.length) {
        console.warn('🧹 Cleaned cart: Removed items from different restaurants', {
          before: prev.length,
          after: cleanedCart.length,
          removed: prev.length - cleanedCart.length
        });
      }

      return cleanedCart;
    });
  }

  // Validate and clean cart on mount/load to prevent multiple restaurant items
  // This runs only once on initial load to clean up any corrupted cart data from localStorage
  useEffect(() => {
    if (cart.length === 0) return;

    // Get unique restaurant IDs and names
    const restaurantIds = cart.map(item => item.restaurantId).filter(Boolean);
    const restaurantNames = cart.map(item => item.restaurant).filter(Boolean);
    const uniqueRestaurantIds = [...new Set(restaurantIds)];
    const uniqueRestaurantNames = [...new Set(restaurantNames)];

    // Normalize restaurant names for comparison
    const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
    const uniqueRestaurantNamesNormalized = uniqueRestaurantNames.map(normalizeName);
    const uniqueRestaurantNamesSet = new Set(uniqueRestaurantNamesNormalized);

    // Check if cart has items from multiple restaurants
    if (uniqueRestaurantIds.length > 1 || uniqueRestaurantNamesSet.size > 1) {
      console.warn('⚠️ Cart contains items from multiple restaurants. Cleaning cart...', {
        restaurantIds: uniqueRestaurantIds,
        restaurantNames: uniqueRestaurantNames
      });

      // Keep items from the first restaurant (most recent or first in cart)
      const firstRestaurantId = uniqueRestaurantIds[0];
      const firstRestaurantName = uniqueRestaurantNames[0];

      setCart((prev) => {
        const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
        const firstRestaurantNameNormalized = normalizeName(firstRestaurantName);

        return prev.filter((item) => {
          const itemRestaurantId = item?.restaurantId;
          const itemRestaurantName = item?.restaurant;
          const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);

          // Check by restaurant name first
          if (firstRestaurantNameNormalized && itemRestaurantNameNormalized) {
            return itemRestaurantNameNormalized === firstRestaurantNameNormalized;
          }
          // Fallback to ID comparison
          if (firstRestaurantId && itemRestaurantId) {
            return itemRestaurantId === firstRestaurantId ||
              itemRestaurantId === firstRestaurantId.toString() ||
              itemRestaurantId.toString() === firstRestaurantId;
          }
          return false;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount to clean up localStorage data

  // Transform cart to match AddToCartAnimation expected structure
  const cartForAnimation = useMemo(() => {
    const items = cart.map(item => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }))

    const itemCount = cart.reduce((total, item) => total + (item.quantity || 0), 0)
    const total = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)

    return {
      items,
      itemCount,
      total,
    }
  }, [cart])

  const value = useMemo(
    () => ({
      _isProvider: true, // Flag to identify this is from the actual provider
      // Keep original cart array for backward compatibility
      cart,
      // Add animation-compatible structure
      items: cartForAnimation.items,
      itemCount: cartForAnimation.itemCount,
      total: cartForAnimation.total,
      lastAddEvent,
      lastRemoveEvent,
      cartConflict,
      addToCart,
      removeFromCart,
      updateQuantity,
      resolveCartConflict,
      getCartCount,
      isInCart,
      getCartItem,
      clearCart,
      cleanCartForRestaurant,
    }),
    [cart, cartForAnimation, lastAddEvent, lastRemoveEvent, cartConflict]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  // Check if context is from the actual provider by checking the _isProvider flag
  if (!context || context._isProvider !== true) {
    // In development, log a warning but don't throw to prevent crashes
    if (import.meta.env.MODE === 'development') {
      console.warn('⚠️ useCart called outside CartProvider. Using default values.');
      console.warn('💡 Make sure the component is rendered inside UserLayout which provides CartProvider.');
    }
    // Return default context instead of throwing
    return defaultCartContext
  }
  return context
}
