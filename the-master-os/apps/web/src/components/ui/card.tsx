import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// -- Card Root --
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outlined" | "elevated";
}

const CARD_VARIANTS = {
  default: "bg-white border border-gray-200 rounded-xl",
  outlined: "bg-transparent border border-gray-200 rounded-xl",
  elevated: "bg-white rounded-xl shadow-md",
} as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div ref={ref} className={cn(CARD_VARIANTS[variant], className)} {...props} />
  ),
);
Card.displayName = "Card";

// -- Card Header --
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

// -- Card Title --
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold text-gray-900", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

// -- Card Description --
export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-gray-500", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

// -- Card Content --
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

// -- Card Footer --
export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
