/** The steps of getting a trip ready, in the order staff do them, with what is still missing at each step. */
export interface ChecklistInput {
  hasDates: boolean;
  pricedHotels: number;      // hotels with at least one price in the trip's table
  madinahHotel: boolean;
  registered: number;
  withoutHotelOrType: number; // active pilgrims (with housing) without a Makkah hotel or room type
  withoutRoom: number;        // active pilgrims in no office room
  transport: { land: boolean; unseated: number; flights: number };
  canSeePrices: boolean;
}
export interface ChecklistStep { key: string; title: string; done: boolean; detail: string; href: string; cta: string; optional?: boolean }

export function tripChecklist(i: ChecklistInput, tripBase: string): ChecklistStep[] {
  const steps: ChecklistStep[] = [
    { key: "dates", title: "تواريخ الرحلة", done: i.hasDates, detail: i.hasDates ? "محددة" : "اختيارية، لكنها تظهر في المنفيست والمطبوعات", href: `${tripBase}/edit`, cta: "حدّد التواريخ", optional: true },
    { key: "hotels", title: "فنادق الرحلة وأسعارها", done: i.pricedHotels > 0 && i.madinahHotel, detail: i.pricedHotels === 0 ? "أضف فندق مكة وأسعار الغرف" : !i.madinahHotel ? "اختر فندق المدينة" : `${i.pricedHotels} فندق في مكة`, href: `${tripBase}#settings`, cta: "عيّن الفنادق والأسعار" },
    { key: "pilgrims", title: "المعتمرون", done: i.registered > 0, detail: i.registered ? `${i.registered} معتمر` : "لم يُضَف أحد بعد", href: `${tripBase}#pilgrims`, cta: "إضافة معتمر" },
  ];
  if (i.registered > 0) {
    steps.push(
      { key: "stay", title: "فندق ونوع غرفة لكل معتمر", done: i.pricedHotels > 0 && i.withoutHotelOrType === 0, detail: i.pricedHotels === 0 ? "يحتاج فنادق مسعّرة أولاً" : i.withoutHotelOrType ? `${i.withoutHotelOrType} معتمر بلا فندق أو نوع غرفة${i.canSeePrices ? " (لا يُحسب سعرهم)" : ""}` : "تم", href: `${tripBase}#pilgrims`, cta: "علّم وعيّن الإقامة" },
      { key: "rooms", title: "توزيع الغرف", done: i.withoutRoom === 0, detail: i.withoutRoom ? `${i.withoutRoom} معتمر بلا غرفة` : "الكل في غرفة", href: `${tripBase}/office-rooms`, cta: "افتح التسكين" },
      i.transport.land
        ? { key: "transport", title: "مقاعد الباصات", done: i.transport.unseated === 0, detail: i.transport.unseated ? `${i.transport.unseated} معتمر بلا مقعد` : "الكل له مقعد", href: `${tripBase}#buses`, cta: "الباصات" }
        : { key: "transport", title: "الرحلة الجوية", done: i.transport.flights > 0, detail: i.transport.flights ? `${i.transport.flights} رحلة جوية` : "أضف الرحلة الجوية", href: `${tripBase}#buses`, cta: "إضافة رحلة" },
    );
  }
  return steps;
}

/** Optional steps are shown but never block «ready» and are never the suggested next step. */
export const checklistProgress = (steps: ChecklistStep[]) => { const req = steps.filter((s) => !s.optional); return { done: req.filter((s) => s.done).length, total: req.length, next: req.find((s) => !s.done) ?? null }; };
