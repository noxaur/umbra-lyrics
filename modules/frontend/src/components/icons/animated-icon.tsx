import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"

type AnimatedIconProps = {
  icon: LucideIcon
  className?: string
  active?: boolean
}

export function AnimatedIcon({ icon: Icon, className, active }: AnimatedIconProps) {
  return (
    <motion.span
      className={className}
      whileHover={{ scale: 1.15, rotate: active ? 0 : 8 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Icon className="size-5" aria-hidden />
    </motion.span>
  )
}
