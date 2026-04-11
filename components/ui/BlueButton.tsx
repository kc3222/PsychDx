import "./bluebutton.css";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

export type BlueButtonVariant = "primary" | "secondary";

export type BlueButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: BlueButtonVariant;
};

/** Class string for `<button className={…}>` when you cannot use `<BlueButton>`. Imports shared styles. */
export function blueButtonClassName(variant: BlueButtonVariant = "primary", className?: string) {
  const mod = variant === "primary" ? "pds-btn--primary" : "pds-btn--secondary";
  return ["pds-btn", mod, className].filter(Boolean).join(" ");
}

export const BlueButton = forwardRef<HTMLButtonElement, BlueButtonProps>(function BlueButton(
  { variant = "primary", className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={blueButtonClassName(variant, className)} {...props} />;
});
