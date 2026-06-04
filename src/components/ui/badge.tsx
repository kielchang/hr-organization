import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        /** 強調資訊（少用，避免與按鈕 primary 混淆） */
        default:
          "border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary/85",
        /** 中性標籤 */
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a]:hover:bg-secondary/85",
        /** 成功／啟用／在職 */
        success:
          "border-success/25 bg-success/12 text-success [a]:hover:bg-success/20 dark:bg-success/20",
        /** 警示 */
        warning:
          "border-warning/30 bg-warning/20 text-warning-foreground [a]:hover:bg-warning/30",
        /** 錯誤／停用／離職 */
        destructive:
          "border-destructive/25 bg-destructive/12 text-destructive [a]:hover:bg-destructive/20 dark:bg-destructive/20",
        /** 標籤、分類（主組別等） */
        info: "border-info/30 bg-info text-info-foreground [a]:hover:bg-info/90",
        /** 邊框型中性 */
        outline:
          "border-border bg-transparent text-foreground [a]:hover:bg-muted",
        /** 弱化狀態 */
        muted:
          "border-transparent bg-muted text-muted-foreground [a]:hover:bg-muted/80",
        ghost:
          "border-transparent bg-transparent text-muted-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        link: "border-transparent text-primary underline-offset-4 [a]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

function Badge({
  className,
  variant = "secondary",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
