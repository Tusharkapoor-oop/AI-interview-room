import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: { translation: {
    ai_interviewer: 'AI Interviewer',
    type_message: 'Type your answer...',
    send: 'Send',
    security_alert: 'Security Alert:',
    lost_gaze: 'Please look at the screen — gaze anomaly detected.',
  }},
  es: { translation: {
    ai_interviewer: 'Entrevistador IA',
    type_message: 'Escribe tu respuesta...',
    send: 'Enviar',
    security_alert: 'Alerta de Seguridad:',
    lost_gaze: 'Por favor mira la pantalla — anomalía de mirada detectada.',
  }},
  zh: { translation: {
    ai_interviewer: 'AI 面试官',
    type_message: '输入您的回答...',
    send: '发送',
    security_alert: '安全警报：',
    lost_gaze: '请注视屏幕 — 检测到视线异常。',
  }},
  hi: { translation: {
    ai_interviewer: 'AI साक्षात्कारकर्ता',
    type_message: 'अपना उत्तर टाइप करें...',
    send: 'भेजें',
    security_alert: 'सुरक्षा चेतावनी:',
    lost_gaze: 'कृपया स्क्रीन देखें — नज़र असामान्य पाई गई।',
  }},
  fr: { translation: {
    ai_interviewer: 'Intervieweur IA',
    type_message: 'Tapez votre réponse...',
    send: 'Envoyer',
    security_alert: 'Alerte de sécurité :',
    lost_gaze: "Regardez l'écran — anomalie de regard détectée.",
  }},
  de: { translation: {
    ai_interviewer: 'KI-Interviewer',
    type_message: 'Antwort eingeben...',
    send: 'Senden',
    security_alert: 'Sicherheitswarnung:',
    lost_gaze: 'Bitte schauen Sie auf den Bildschirm — Blickanomalie erkannt.',
  }},
  ja: { translation: {
    ai_interviewer: 'AI面接官',
    type_message: '回答を入力...',
    send: '送信',
    security_alert: 'セキュリティ警告：',
    lost_gaze: '画面を見てください — 視線の異常が検出されました。',
  }},
  ar: { translation: {
    ai_interviewer: 'المحاور الذكي',
    type_message: 'اكتب إجابتك...',
    send: 'إرسال',
    security_alert: 'تنبيه أمني:',
    lost_gaze: 'يرجى النظر إلى الشاشة — تم اكتشاف شذوذ في النظرة.',
  }},
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
