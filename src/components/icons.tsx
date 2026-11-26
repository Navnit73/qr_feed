import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronsUp,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  HelpCircle,
  Info,
  LayoutDashboard,
  LogOut,
  type LucideProps,
  MapPin,
  MessageSquareText,
  Printer,
  QrCode,
  Shield,
  ShieldCheck,
  Settings,
  Star,
  Ticket,
  Timer,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Domain names → lucide icons. Screens say `<Icon name="sla" />`, so if we change the
 * glyph for "SLA" it changes everywhere at once.
 */
export const icons = {
  // Product vocabulary (see phase.md)
  dashboard: LayoutDashboard,
  qr: QrCode,
  ticket: Ticket,
  feedback: MessageSquareText,
  rating: Star,
  sla: Timer,
  escalate: ChevronsUp,
  rca: FileSearch,
  capa: ClipboardCheck,
  audit: ClipboardList,
  verify: ShieldCheck,
  location: MapPin,
  branch: Building2,
  user: User,
  users: Users,
  notification: Bell,
  report: TrendingUp,
  settings: Settings,
  signOut: LogOut,
  arrowRight: ArrowRight,
  print: Printer,
  superAdmin: Shield,
  // Status tones, shared with Alert and SweetAlert
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  question: HelpCircle,
} as const

export type IconName = keyof typeof icons
export const iconNames = Object.keys(icons) as IconName[]

/** Decorative by default. Pass `label` when the icon carries meaning on its own. */
export function Icon({
  name,
  label,
  className,
  ...props
}: { name: IconName; label?: string } & Omit<LucideProps, "ref">) {
  const Glyph = icons[name]
  return (
    <Glyph
      className={cn("size-4 shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...props}
    />
  )
}
