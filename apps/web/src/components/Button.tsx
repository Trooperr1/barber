import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-800',
  secondary: 'bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-zinc-700 hover:bg-zinc-100',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`min-h-[44px] rounded-xl px-4 py-2 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
