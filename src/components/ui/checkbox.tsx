import * as React from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { cn } from "@/lib/utils"

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, disabled, ...props }, ref) => {
    return (
      <span className="relative inline-flex size-[18px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          disabled={disabled}
          className={cn(
            "peer size-[18px] shrink-0 appearance-none rounded-sm border border-input bg-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "checked:border-primary checked:bg-primary",
            className,
          )}
          onChange={(e) => {
            onChange?.(e)
            onCheckedChange?.(e.target.checked)
          }}
          {...props}
        />
        <LottieIcon name="check"
          className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
          aria-hidden
        />
      </span>
    )
  },
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
