// Simple stroke icons (24×24). Color follows currentColor.

function Icon({ children, className = 'size-6', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const JobsIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3v2h6V3M9 10h6M9 14h6M9 18h3" />
  </Icon>
)

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
)

export const QuoteIcon = (p) => (
  <Icon {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4M12.5 10.5c-.5-.6-1.2-.9-2-.8-1 .1-1.6.8-1.5 1.6.2 1.9 3.9 1 4 3 .1.9-.6 1.6-1.6 1.7-.9.1-1.8-.3-2.3-1M11 9v1M11 16v1" />
  </Icon>
)

export const TasksIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
)

export const ClientsIcon = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.3 5.2" />
  </Icon>
)

export const HomeIcon = (p) => (
  <Icon {...p}>
    <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />
  </Icon>
)

export const UsersIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.6-3.7 3.4-6 7-6s6.4 2.3 7 6" />
  </Icon>
)

export const CameraIcon = (p) => (
  <Icon {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
)

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const BackIcon = (p) => (
  <Icon {...p}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
)

export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

export const EditIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icon>
)

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
)

export const DismissIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="m6.5 17.5 11-11" />
  </Icon>
)

export const LinkIcon = (p) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
)

export const FilterIcon = (p) => (
  <Icon {...p}>
    <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />
  </Icon>
)

export const PhoneIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1" />
  </Icon>
)

export const MailIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
)

export const MapIcon = (p) => (
  <Icon {...p}>
    <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </Icon>
)

export const AlertIcon = (p) => (
  <Icon {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Icon>
)

export const OfflineIcon = (p) => (
  <Icon {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-2.3-1.6M2 9.5a15 15 0 0 1 4.5-2.8M22 9.5A15 15 0 0 0 11 5.1M12 20v.01" />
  </Icon>
)

export const UndoIcon = (p) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
)

export const PenIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20c3-1 4-4 7-4s3 2 6 1 3-6 3-6" />
  </Icon>
)

export const ArrowIcon = (p) => (
  <Icon {...p}>
    <path d="M5 19 19 5M10 5h9v9" />
  </Icon>
)

export const RectIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="6" width="16" height="12" rx="1" />
  </Icon>
)

export const TextIcon = (p) => (
  <Icon {...p}>
    <path d="M5 6V4h14v2M12 4v16M9 20h6" />
  </Icon>
)

export const LogoutIcon = (p) => (
  <Icon {...p}>
    <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />
  </Icon>
)

export const PrintIcon = (p) => (
  <Icon {...p}>
    <path d="M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7z" />
  </Icon>
)
