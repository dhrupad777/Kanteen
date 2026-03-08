# Duolingo-Style Animation Guide for Kanteen

A guide to implementing playful, rewarding animations that make the food ordering experience delightful while maintaining performance.

## Current Setup

Kanteen uses **Framer Motion** (`framer-motion@^11.3.12`) and **Tailwind CSS Animate**. Both are already installed.

---

## Animation Patterns

### 1. Entrance Animations

**Staggered List Items** - Used in cart page:
```tsx
import { motion } from "framer-motion";

// Container with stagger
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

// Child items
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

<motion.div variants={container} initial="hidden" animate="show">
  {items.map(item => (
    <motion.div key={item.id} variants={item}>
      {/* content */}
    </motion.div>
  ))}
</motion.div>
```

### 2. Micro-Interactions (Buttons, Cards)

**Tap/Press Feedback** - Duolingo signature bounce:
```tsx
<motion.button
  whileTap={{ scale: 0.95 }}
  whileHover={{ scale: 1.02 }}
  transition={{ type: "spring", stiffness: 400, damping: 17 }}
>
  Order Now
</motion.button>
```

**Success Pulse** - After adding to cart:
```tsx
const [added, setAdded] = useState(false);

<motion.div
  animate={added ? { 
    scale: [1, 1.2, 1],
    backgroundColor: ["#fff", "#4ade80", "#fff"]
  } : {}}
  transition={{ duration: 0.4 }}
>
```

### 3. Status Change Celebrations 🎉

**Order Ready Animation** - Make the OTP reveal exciting:
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
  animate={{ opacity: 1, scale: 1, rotate: 0 }}
  transition={{ 
    type: "spring",
    stiffness: 200,
    damping: 15
  }}
>
  <p className="text-4xl font-black">{otp}</p>
</motion.div>
```

**Confetti Effect** (lightweight CSS version):
```css
/* globals.css */
@keyframes confetti {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(-100px) rotate(720deg); opacity: 0; }
}

.confetti-particle {
  animation: confetti 0.8s ease-out forwards;
}
```

### 4. Progress & Loading States

**Skeleton with Shimmer** - Already in use, enhance with subtle pulse:
```tsx
<div className="animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 
  bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
```

**Order Status Progress**:
```tsx
const statusSteps = ["Placed", "Preparing", "Ready"];
const currentIndex = statusSteps.indexOf(status);

<div className="flex gap-2">
  {statusSteps.map((step, i) => (
    <motion.div
      key={step}
      initial={false}
      animate={{ 
        scale: i === currentIndex ? 1.1 : 1,
        backgroundColor: i <= currentIndex ? "#f97316" : "#e5e7eb"
      }}
      className="h-2 flex-1 rounded-full"
    />
  ))}
</div>
```

---

## Performance Best Practices

### DO ✅

1. **Use `transform` and `opacity` only** - GPU accelerated
2. **Use `layoutId` for shared element transitions**
3. **Add `will-change: transform`** for complex animations
4. **Use `useMemo`** for animation variants
5. **Respect `prefers-reduced-motion`**:
```tsx
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

<motion.div
  animate={prefersReducedMotion ? {} : { scale: 1.1 }}
/>
```

### DON'T ❌

1. Animate `width`, `height`, `top`, `left` (causes layout thrashing)
2. Use too many simultaneous animations (>10 elements)
3. Animate on scroll without throttling
4. Use complex spring physics on low-end devices

---

## Quick Wins for Kanteen

| Component | Animation Idea | Impact |
|-----------|----------------|--------|
| Add to Cart button | Bounce + cart icon flies | High |
| Order status change | Celebratory pulse | High |
| OTP reveal | Spring-in with glow | Medium |
| Menu items | Staggered fade-in | Medium |
| Price update | Number counter animation | Low |

---

## Example: Enhanced Order Success Page

```tsx
// order/success/page.tsx
<motion.div
  initial={{ opacity: 0, y: 50 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", bounce: 0.4 }}
>
  <motion.div
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ delay: 0.2, type: "spring" }}
  >
    <CheckCircle2 className="w-20 h-20 text-green-500" />
  </motion.div>
  
  <motion.p
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.4 }}
  >
    Order Confirmed!
  </motion.p>
</motion.div>
```

---

## Resources

- [Framer Motion Docs](https://www.framer.com/motion/)
- [Duolingo Design Blog](https://design.duolingo.com/)
- CSS-only alternatives: `tailwindcss-animate` keyframes in `tailwind.config.ts`
