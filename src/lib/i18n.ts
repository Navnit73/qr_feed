/**
 * Public feedback form & tracking page translations (F-2.7).
 * Supports English, Hindi, Spanish, French and Arabic (RTL).
 */

export const SUPPORTED_LOCALES = [
  { code: "en", label: "English", native: "English", dir: "ltr" },
  { code: "hi", label: "Hindi", native: "हिन्दी", dir: "ltr" },
  { code: "es", label: "Spanish", native: "Español", dir: "ltr" },
  { code: "fr", label: "French", native: "Français", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl" },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"]

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code))

export function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return !!value && LOCALE_SET.has(value)
}

export function isRtlLocale(locale: LocaleCode): boolean {
  return locale === "ar"
}

export function detectLocale(
  acceptLanguage?: string | null,
  queryLang?: string | null,
): LocaleCode {
  if (queryLang) {
    const clean = queryLang.toLowerCase().split("-")[0]
    if (isLocaleCode(clean)) return clean
  }
  if (acceptLanguage) {
    const candidates = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag, qPart] = part.trim().split(";")
        const q = qPart?.startsWith("q=") ? Number(qPart.slice(2)) : 1
        return { lang: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 }
      })
      .sort((a, b) => b.q - a.q)

    for (const c of candidates) {
      if (isLocaleCode(c.lang)) return c.lang
    }
  }
  return "en"
}

export type GuestStrings = {
  languageLabel: string
  subtitle: string
  inactiveTitle: string
  inactiveBody: string
  poweredBy: string
  whatsItAbout: string
  howWasIt: string
  starSingular: string
  starPlural: string
  whatHappened: string
  descriptionPlaceholder: string
  howUrgent: string
  canWait: string
  urgent: string
  addPhotos: string
  photosHint: string
  removePhoto: string
  uploadingPhoto: string
  contactSummary: string
  name: string
  email: string
  phone: string
  consentBase: string
  consentSensitive: string
  sendFeedback: string
  // Tracking page
  notFoundTitle: string
  notFoundBody: string
  thanksNewTitle: string
  thanksNewSubtitle: string
  thanksDupTitle: string
  dupAlertTitle: string
  dupAlertBody: string
  yourTicket: string
  where: string
  about: string
  reported: string
  reportsCount: string
  people: string
  progressLabel: string
  stepReceived: string
  stepInProgress: string
  stepVerifying: string
  stepResolved: string
  updatesHeading: string
  photosHeading: string
  bookmarkHint: string
  copyTrackingLink: string
  // Post-closure requester feedback (P5)
  closurePromptTitle: string
  closurePromptBody: string
  yesResolved: string
  noStillIssue: string
  closureCommentLabel: string
  submitClosureFeedback: string
  closureThanks: string
}

const DICTIONARIES: Record<LocaleCode, GuestStrings> = {
  en: {
    languageLabel: "Language",
    subtitle: "Spotted a problem here? Tell us and the right person gets it straight away.",
    inactiveTitle: "This QR code is no longer active",
    inactiveBody:
      "It may have been replaced. Please tell a member of staff, or look for a newer code nearby.",
    poweredBy: "Powered by QR Feed",
    whatsItAbout: "What's it about?",
    howWasIt: "How was it?",
    starSingular: "star",
    starPlural: "stars",
    whatHappened: "What happened?",
    descriptionPlaceholder: "e.g. The floor is wet near the sinks and there are no paper towels.",
    howUrgent: "How urgent is it?",
    canWait: "It can wait",
    urgent: "Urgent",
    addPhotos: "Add photos (optional)",
    photosHint: "Up to 3 photos, max 5 MB each. Location metadata is stripped automatically.",
    removePhoto: "Remove photo",
    uploadingPhoto: "Uploading photo…",
    contactSummary: "Want updates? Add your contact (optional)",
    name: "Name",
    email: "Email",
    phone: "Phone",
    consentBase: "I'm happy for this to be shared with the team.",
    consentSensitive: "I haven't included anyone's medical or personal details.",
    sendFeedback: "Send feedback",
    notFoundTitle: "We couldn't find that report",
    notFoundBody: "Check the link, or scan the QR code again.",
    thanksNewTitle: "Thanks, we've got it",
    thanksNewSubtitle: "The team has been notified.",
    thanksDupTitle: "Thanks for telling us",
    dupAlertTitle: "Someone already reported this",
    dupAlertBody: "We've added your report to the open ticket, so it gets fixed sooner.",
    yourTicket: "Your ticket",
    where: "Where",
    about: "About",
    reported: "Reported",
    reportsCount: "Reports",
    people: "people",
    progressLabel: "Progress",
    stepReceived: "Received",
    stepInProgress: "In progress",
    stepVerifying: "Being verified",
    stepResolved: "Resolved",
    updatesHeading: "Updates from the team",
    photosHeading: "Attached photos",
    bookmarkHint: "Bookmark this page or copy the link to check progress later.",
    copyTrackingLink: "Copy tracking link",
    closurePromptTitle: "Was your issue resolved?",
    closurePromptBody: "Let us know how the resolution went.",
    yesResolved: "Yes, resolved",
    noStillIssue: "No, still an issue",
    closureCommentLabel: "Any final comments (optional)",
    submitClosureFeedback: "Submit feedback",
    closureThanks: "Thank you for rating the resolution.",
  },
  hi: {
    languageLabel: "भाषा",
    subtitle: "क्या यहाँ कोई समस्या दिखी? हमें बताएं, सही टीम को तुरंत सूचना मिल जाएगी।",
    inactiveTitle: "यह QR कोड अब सक्रिय नहीं है",
    inactiveBody: "शायद इसे बदल दिया गया है। कृपया स्टाफ को बताएं या पास का नया कोड स्कैन करें।",
    poweredBy: "QR Feed द्वारा संचालित",
    whatsItAbout: "यह किस बारे में है?",
    howWasIt: "आपका अनुभव कैसा रहा?",
    starSingular: "स्टार",
    starPlural: "स्टार",
    whatHappened: "क्या हुआ?",
    descriptionPlaceholder: "उदाहरण: सिंक के पास फर्श गीला है और पेपर टॉवल नहीं हैं।",
    howUrgent: "यह कितना ज़रूरी है?",
    canWait: "सामान्य",
    urgent: "अति आवश्यक",
    addPhotos: "फ़ोटो जोड़ें (वैकल्पिक)",
    photosHint: "अधिकतम 3 फ़ोटो, प्रत्येक 5 MB तक। लोकेशन डेटा स्वतः हटा दिया जाता है।",
    removePhoto: "फ़ोटो हटाएं",
    uploadingPhoto: "फ़ोटो अपलोड हो रही है…",
    contactSummary: "अपडेट चाहिए? अपना संपर्क जोड़ें (वैकल्पिक)",
    name: "नाम",
    email: "ईमेल",
    phone: "फ़ोन",
    consentBase: "मैं इसे टीम के साथ साझा करने के लिए सहमत हूँ।",
    consentSensitive: "मैंने किसी की मेडिकल या व्यक्तिगत जानकारी शामिल नहीं की है।",
    sendFeedback: "फ़ीडबैक भेजें",
    notFoundTitle: "हमें वह रिपोर्ट नहीं मिली",
    notFoundBody: "लिंक जांचें, या QR कोड फिर से स्कैन करें।",
    thanksNewTitle: "धन्यवाद, हमें आपकी रिपोर्ट मिल गई",
    thanksNewSubtitle: "टीम को सूचित कर दिया गया है।",
    thanksDupTitle: "बताने के लिए धन्यवाद",
    dupAlertTitle: "किसी ने पहले ही इसकी रिपोर्ट की है",
    dupAlertBody: "हमने आपकी रिपोर्ट को खुले टिकट में जोड़ दिया है ताकि यह जल्दी ठीक हो सके।",
    yourTicket: "आपका टिकट",
    where: "स्थान",
    about: "विषय",
    reported: "समय",
    reportsCount: "रिपोर्ट्स",
    people: "लोग",
    progressLabel: "प्रगति",
    stepReceived: "प्राप्त हुआ",
    stepInProgress: "कार्य जारी है",
    stepVerifying: "सत्यापन हो रहा है",
    stepResolved: "हल हो गया",
    updatesHeading: "टीम की ओर से अपडेट",
    photosHeading: "संलग्न फ़ोटो",
    bookmarkHint: "बाद में स्थिति देखने के लिए इस पेज को बुकमार्क करें या लिंक कॉपी करें।",
    copyTrackingLink: "ट्रैकिंग लिंक कॉपी करें",
    closurePromptTitle: "क्या आपकी समस्या हल हो गई?",
    closurePromptBody: "हमें बताएं कि समाधान कैसा रहा।",
    yesResolved: "हाँ, हल हो गई",
    noStillIssue: "नहीं, समस्या अभी भी है",
    closureCommentLabel: "कोई अन्य टिप्पणी (वैकल्पिक)",
    submitClosureFeedback: "प्रतिक्रिया भेजें",
    closureThanks: "समाधान को रेट करने के लिए धन्यवाद।",
  },
  es: {
    languageLabel: "Idioma",
    subtitle: "¿Viste un problema aquí? Cuéntanos y el equipo indicado lo recibirá de inmediato.",
    inactiveTitle: "Este código QR ya no está activo",
    inactiveBody:
      "Puede haber sido reemplazado. Avisa a un miembro del personal o busca un código nuevo cerca.",
    poweredBy: "Impulsado por QR Feed",
    whatsItAbout: "¿De qué se trata?",
    howWasIt: "¿Cómo fue tu experiencia?",
    starSingular: "estrella",
    starPlural: "estrellas",
    whatHappened: "¿Qué ocurrió?",
    descriptionPlaceholder:
      "ej. El suelo está mojado cerca de los lavabos y no hay toallas de papel.",
    howUrgent: "¿Qué tan urgente es?",
    canWait: "Puede esperar",
    urgent: "Urgente",
    addPhotos: "Añadir fotos (opcional)",
    photosHint: "Hasta 3 fotos, máx. 5 MB cada una. Los datos GPS se eliminan automáticamente.",
    removePhoto: "Quitar foto",
    uploadingPhoto: "Subiendo foto…",
    contactSummary: "¿Quieres recibir actualizaciones? Añade tu contacto (opcional)",
    name: "Nombre",
    email: "Correo electrónico",
    phone: "Teléfono",
    consentBase: "Acepto que esto se comparta con el equipo.",
    consentSensitive: "No he incluido datos médicos ni personales de nadie.",
    sendFeedback: "Enviar reporte",
    notFoundTitle: "No encontramos ese reporte",
    notFoundBody: "Revisa el enlace o escanea el código QR de nuevo.",
    thanksNewTitle: "Gracias, lo recibimos",
    thanksNewSubtitle: "El equipo ha sido notificado.",
    thanksDupTitle: "Gracias por avisarnos",
    dupAlertTitle: "Alguien ya reportó esto",
    dupAlertBody: "Añadimos tu reporte al ticket abierto para resolverlo antes.",
    yourTicket: "Tu ticket",
    where: "Lugar",
    about: "Tema",
    reported: "Reportado",
    reportsCount: "Reportes",
    people: "personas",
    progressLabel: "Progreso",
    stepReceived: "Recibido",
    stepInProgress: "En progreso",
    stepVerifying: "En verificación",
    stepResolved: "Resuelto",
    updatesHeading: "Actualizaciones del equipo",
    photosHeading: "Fotos adjuntas",
    bookmarkHint: "Guarda esta página o copia el enlace para consultar el avance después.",
    copyTrackingLink: "Copiar enlace",
    closurePromptTitle: "¿Se resolvió tu problema?",
    closurePromptBody: "Cuéntanos cómo fue la solución.",
    yesResolved: "Sí, resuelto",
    noStillIssue: "No, sigue el problema",
    closureCommentLabel: "Comentarios finales (opcional)",
    submitClosureFeedback: "Enviar opinión",
    closureThanks: "Gracias por calificar la solución.",
  },
  fr: {
    languageLabel: "Langue",
    subtitle: "Vous remarquez un problème ici ? Dites-le-nous pour alerter la bonne équipe.",
    inactiveTitle: "Ce code QR n'est plus actif",
    inactiveBody:
      "Il a peut-être été remplacé. Prévenez un membre du personnel ou cherchez un code plus récent.",
    poweredBy: "Propulsé par QR Feed",
    whatsItAbout: "De quoi s'agit-il ?",
    howWasIt: "Comment était-ce ?",
    starSingular: "étoile",
    starPlural: "étoiles",
    whatHappened: "Que s'est-il passé ?",
    descriptionPlaceholder: "ex. Le sol est mouillé près des lavabos et il n'y a plus de papier.",
    howUrgent: "Quel est le degré d'urgence ?",
    canWait: "Peut attendre",
    urgent: "Urgent",
    addPhotos: "Ajouter des photos (facultatif)",
    photosHint: "Jusqu'à 3 photos, 5 Mo max chacune. Les métadonnées GPS sont supprimées.",
    removePhoto: "Retirer la photo",
    uploadingPhoto: "Envoi de la photo…",
    contactSummary: "Recevoir des nouvelles ? Ajoutez vos coordonnées (facultatif)",
    name: "Nom",
    email: "E-mail",
    phone: "Téléphone",
    consentBase: "J'accepte que cela soit partagé avec l'équipe.",
    consentSensitive: "Je n'ai inclus aucune donnée médicale ou personnelle.",
    sendFeedback: "Envoyer le signalement",
    notFoundTitle: "Signalement introuvable",
    notFoundBody: "Vérifiez le lien ou scannez de nouveau le code QR.",
    thanksNewTitle: "Merci, c'est bien reçu",
    thanksNewSubtitle: "L'équipe a été prévenue.",
    thanksDupTitle: "Merci de nous prévenir",
    dupAlertTitle: "Quelqu'un l'a déjà signalé",
    dupAlertBody:
      "Votre signalement a été ajouté au ticket ouvert pour accélérer la prise en charge.",
    yourTicket: "Votre ticket",
    where: "Lieu",
    about: "Sujet",
    reported: "Signalé",
    reportsCount: "Signalements",
    people: "personnes",
    progressLabel: "Progression",
    stepReceived: "Reçu",
    stepInProgress: "En cours",
    stepVerifying: "En vérification",
    stepResolved: "Résolu",
    updatesHeading: "Nouvelles de l'équipe",
    photosHeading: "Photos jointes",
    bookmarkHint: "Ajoutez cette page aux favoris ou copiez le lien pour suivre l'avancement.",
    copyTrackingLink: "Copier le lien de suivi",
    closurePromptTitle: "Votre problème a-t-il été résolu ?",
    closurePromptBody: "Dites-nous si la résolution vous convient.",
    yesResolved: "Oui, résolu",
    noStillIssue: "Non, toujours en cours",
    closureCommentLabel: "Commentaire final (facultatif)",
    submitClosureFeedback: "Envoyer l'avis",
    closureThanks: "Merci d'avoir évalué la résolution.",
  },
  ar: {
    languageLabel: "اللغة",
    subtitle: "هل لاحظت مشكلة هنا؟ أخبرنا ليصل البلاغ إلى الفريق المختص فوراً.",
    inactiveTitle: "رمز QR هذا لم يعد نشطاً",
    inactiveBody: "ربما تم استبداله. يرجى إبلاغ أحد الموظفين أو البحث عن رمز أحدث بالقرب منك.",
    poweredBy: "مدعوم بواسطة QR Feed",
    whatsItAbout: "ما هو موضوع البلاغ؟",
    howWasIt: "كيف كانت تجربتك؟",
    starSingular: "نجمة",
    starPlural: "نجوم",
    whatHappened: "ماذا حدث؟",
    descriptionPlaceholder: "مثال: الأرضية مبللة بالقرب من المغاسل ولا توجد مناديل ورقية.",
    howUrgent: "ما مدى الاستعجال؟",
    canWait: "عادي",
    urgent: "عاجل",
    addPhotos: "إضافة صور (اختياري)",
    photosHint: "حتى 3 صور، بحد أقصى 5 ميجابايت لكل صورة. يتم حذف بيانات الموقع تلقائياً.",
    removePhoto: "إزالة الصورة",
    uploadingPhoto: "جارٍ رفع الصورة…",
    contactSummary: "هل تريد متابعة التحديثات؟ أضف بياناتك (اختياري)",
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    consentBase: "أوافق على مشاركة هذا البلاغ مع الفريق المختص.",
    consentSensitive: "لم أقم بتضمين أي تفاصيل طبية أو شخصية لأي شخص.",
    sendFeedback: "إرسال البلاغ",
    notFoundTitle: "لم نتمكن من العثور على هذا البلاغ",
    notFoundBody: "تحقق من الرابط أو امسح رمز QR مرة أخرى.",
    thanksNewTitle: "شكراً لك، تم استلام بلاغك",
    thanksNewSubtitle: "تم إشعار الفريق المختص.",
    thanksDupTitle: "شكراً لإبلاغنا",
    dupAlertTitle: "تم الإبلاغ عن هذه المشكلة مسبقاً",
    dupAlertBody: "تمت إضافة بلاغك إلى التذكرة المفتوحة لسرعة المعالجة.",
    yourTicket: "رقم التذكرة",
    where: "الموقع",
    about: "التصنيف",
    reported: "وقت البلاغ",
    reportsCount: "البلاغات",
    people: "أشخاص",
    progressLabel: "الحالة",
    stepReceived: "تم الاستلام",
    stepInProgress: "قيد المعالجة",
    stepVerifying: "قيد التحقق",
    stepResolved: "تم الحل",
    updatesHeading: "تحديثات الفريق",
    photosHeading: "الصور المرفقة",
    bookmarkHint: "احفظ هذه الصفحة أو انسخ الرابط لمتابعة التقدم لاحقاً.",
    copyTrackingLink: "نسخ رابط المتابعة",
    closurePromptTitle: "هل تم حل مشكلتك؟",
    closurePromptBody: "أخبرنا برأيك في الحل المقدم.",
    yesResolved: "نعم، تم الحل",
    noStillIssue: "لا، المشكلة لا تزال قائمة",
    closureCommentLabel: "ملاحظات إضافية (اختياري)",
    submitClosureFeedback: "إرسال التقييم",
    closureThanks: "شكراً لتقييمك مستوى الحل.",
  },
}

const CATEGORY_TRANSLATIONS: Record<Exclude<LocaleCode, "en">, Record<string, string>> = {
  hi: {
    cleanliness: "सफ़ाई",
    housekeeping: "हाउसकीपिंग",
    maintenance: "रखरखाव",
    facilities: "सुविधाएं",
    safety: "सुरक्षा",
    waiting_time: "प्रतीक्षा समय",
    staff_behaviour: "स्टाफ़ व्यवहार",
    patient_care: "रोगी देखभाल",
    billing: "बिलिंग",
    food_beverage: "भोजन और पेय",
    room_comfort: "कमरे की सुविधा",
    wifi_tech: "वाई-फ़ाई / तकनीक",
    washrooms: "शौचालय",
    parking: "पार्किंग",
    lifts_escalators: "लिफ्ट / एस्केलेटर",
    equipment: "उपकरण",
    quality: "गुणवत्ता",
    near_miss: "संभावित दुर्घटना",
    other: "अन्य",
  },
  es: {
    cleanliness: "Limpieza",
    housekeeping: "Limpieza de habitación",
    maintenance: "Mantenimiento",
    facilities: "Instalaciones",
    safety: "Seguridad",
    waiting_time: "Tiempo de espera",
    staff_behaviour: "Atención del personal",
    patient_care: "Atención al paciente",
    billing: "Facturación",
    food_beverage: "Alimentos y bebidas",
    room_comfort: "Comodidad",
    wifi_tech: "Wi-Fi / tecnología",
    washrooms: "Baños",
    parking: "Estacionamiento",
    lifts_escalators: "Ascensores",
    equipment: "Equipos",
    quality: "Calidad",
    near_miss: "Casi accidente",
    other: "Otro",
  },
  fr: {
    cleanliness: "Propreté",
    housekeeping: "Ménage",
    maintenance: "Maintenance",
    facilities: "Équipements",
    safety: "Sécurité",
    waiting_time: "Temps d'attente",
    staff_behaviour: "Accueil",
    patient_care: "Soins",
    billing: "Facturation",
    food_beverage: "Restauration",
    room_comfort: "Confort",
    wifi_tech: "Wi-Fi / technique",
    washrooms: "Toilettes",
    parking: "Stationnement",
    lifts_escalators: "Ascenseurs",
    equipment: "Matériel",
    quality: "Qualité",
    near_miss: "Presqu'accident",
    other: "Autre",
  },
  ar: {
    cleanliness: "النظافة",
    housekeeping: "تنظيف الغرف",
    maintenance: "الصيانة",
    facilities: "المرافق",
    safety: "السلامة",
    waiting_time: "وقت الانتظار",
    staff_behaviour: "تعامل الموظفين",
    patient_care: "رعاية المرضى",
    billing: "الفواتير",
    food_beverage: "الطعام والمشروبات",
    room_comfort: "راحة الغرفة",
    wifi_tech: "الإنترنت والتقنية",
    washrooms: "دورات المياه",
    parking: "المواقف",
    lifts_escalators: "المصاعد",
    equipment: "المعدات",
    quality: "الجودة",
    near_miss: "حادث وشيك",
    other: "أخرى",
  },
}

export function getGuestStrings(locale: LocaleCode): GuestStrings {
  return DICTIONARIES[locale] ?? DICTIONARIES.en
}

export function translateCategoryLabel(locale: LocaleCode, key: string, fallback: string): string {
  if (locale === "en") return fallback
  return CATEGORY_TRANSLATIONS[locale]?.[key] ?? fallback
}
