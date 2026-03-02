import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline" | "waiting" | "interviewing" | "called" | "finished" | "skipped"
}

const variantClasses: Record<string, string> = {
    default: "bg-slate-900 text-white border-transparent",
    secondary: "bg-slate-100 text-slate-900 border-transparent",
    destructive: "bg-red-500 text-white border-transparent",
    outline: "text-slate-950 border-slate-200 bg-transparent",
    waiting: "bg-amber-100 text-amber-800 border-transparent",
    called: "bg-blue-100 text-blue-800 border-transparent",
    interviewing: "bg-purple-100 text-purple-800 border-transparent",
    finished: "bg-green-100 text-green-800 border-transparent",
    skipped: "bg-slate-100 text-slate-500 border-transparent",
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
                variantClasses[variant],
                className
            )}
            {...props}
        />
    )
}

export { Badge }
