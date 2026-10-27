export const GENDER_LABELS = { MALE: "ذكر", FEMALE: "أنثى" } as const;
export const DOC_LABELS = { PASSPORT: "صورة الجواز", PHOTO: "صورة شخصية", NATIONAL_ID: "الهوية", OTHER: "أخرى" } as const;
export const TRANSPORT_LABELS = { LAND: "بري", AIR: "جوي" } as const;
export const TRIP_STATUS_LABELS = { OPEN: "مفتوحة", FULL: "مكتملة", TRAVELLING: "مسافرة", RETURNED: "عادت", CANCELLED: "ملغاة" } as const;
export const VISA_LABELS = { NOT_SUBMITTED: "لم تقدَّم", IN_PROGRESS: "قيد المعالجة", ISSUED: "صدرت", REJECTED: "مرفوضة" } as const;
export const GOVERNORATES = ["نينوى", "بغداد", "أربيل", "دهوك", "السليمانية", "كركوك", "صلاح الدين", "الأنبار", "ديالى", "بابل", "كربلاء", "النجف", "القادسية", "المثنى", "واسط", "ميسان", "ذي قار", "البصرة"];
export const REQUIRED_DOCS = ["PASSPORT", "PHOTO"] as const;
