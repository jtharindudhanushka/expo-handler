import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline" | "waiting" | "interviewing" | "called" | "finished" | "skipped"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                {
                    "border-transparent bg-slate-900 text-slate-50": variant === "default",
                    "border-transparent bg-slate-100 text-slate-900": variant === "secondary",
                    "border-transparent bg-red-500 text-slate-50": variant === "destructive",
                    "text-slate-950 border-slate-200": variant === "outline",
                    "border-transparent bg-amber-100 text-amber-800": variant === "waiting",
                    "border-transparent bg-blue-100 text-blue-800": variant === "called",
                    "border-transparent bg-purple-100 text-purple-800": variant === "interviewing",
                    "border-transparent bg-green-100 text-green-800": variant === "finished",
                    "border-transparent bg-slate-100 text-slate-500": variant === "skipped",
                },
                className
            )}
            {...props}
        />
    )
}

export { Badge }
