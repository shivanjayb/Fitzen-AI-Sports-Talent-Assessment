import { useSyncExternalStore } from 'react';
import type { ExerciseDef } from '@fitzen/engines';
export type Language = 'en' | 'hi';
let language: Language = 'en';
try { if (localStorage.getItem('fitzen.language') === 'hi') language = 'hi'; } catch { /* use English */ }
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const useLanguage = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, getLanguage);
export function setLanguage(value: Language) {
  language = value;
  try { localStorage.setItem('fitzen.language', value); } catch { /* this tab only */ }
  document.documentElement.lang = value;
  listeners.forEach((f) => f());
}
const HI: Record<string, string> = {
  Train: 'अभ्यास', Progress: 'प्रगति', Compete: 'मुकाबला', History: 'इतिहास', Profile: 'प्रोफ़ाइल',
  'Guided assessment': 'निर्देशित मूल्यांकन', 'Start guided assessment': 'मूल्यांकन शुरू करें',
  'Coach validation': 'कोच द्वारा सत्यापन', 'Start this test': 'यह परीक्षण शुरू करें',
  'Follow this protocol': 'इन निर्देशों का पालन करें', 'Back to exercise library': 'अभ्यास सूची पर लौटें',
  'Your movement lab': 'आपकी मूवमेंट लैब', 'Good morning': 'सुप्रभात', 'Good afternoon': 'नमस्कार', 'Good evening': 'शुभ संध्या',
  'Go again': 'फिर करें', 'Sessions this week': 'इस सप्ताह के सत्र', 'Avg form score': 'औसत तकनीक स्कोर', 'Day streak': 'लगातार अभ्यास के दिन',
  'Search squat, javelin, glutes…': 'स्क्वाट, भाला, मांसपेशी खोजें…', All: 'सभी',
  'Start with camera': 'कैमरे से शुरू करें', 'Analyse video': 'वीडियो जाँचें', 'Watch demo': 'डेमो देखें',
  'Set up': 'तैयारी', 'What we measure': 'हम क्या मापते हैं', Camera: 'कैमरा', Target: 'लक्ष्य', Checks: 'जाँच',
  'Print report': 'रिपोर्ट प्रिंट करें', Measurements: 'माप', 'Assessment quality': 'मूल्यांकन की गुणवत्ता',
  'Local coaching report': 'स्थानीय कोचिंग रिपोर्ट', 'Generate report': 'रिपोर्ट देखें', 'Open local guide': 'स्थानीय मार्गदर्शन खोलें',
  'Local coach': 'स्थानीय कोच', 'Fitzen local coach': 'Fitzen स्थानीय कोच',
  'Training goal and retest': 'अभ्यास का लक्ष्य और दोबारा परीक्षण', 'Save goal': 'लक्ष्य सहेजें',
  'Offline assessment': 'ऑफ़लाइन मूल्यांकन', 'Prepare this device for offline use': 'इस डिवाइस को ऑफ़लाइन उपयोग के लिए तैयार करें',
  'Countermovement Jump': 'काउंटरमूवमेंट जंप', 'Bodyweight Squat': 'बॉडीवेट स्क्वाट', 'Push-up': 'पुश-अप', Plank: 'प्लैंक',
  'Hold still…': 'स्थिर रहें…', 'Starting…': 'शुरू हो रहा है…', 'Get into position': 'सही स्थिति में आएँ', End: 'समाप्त',
  'Review my session': 'मेरे सत्र की समीक्षा', 'What needs attention?': 'किस पर ध्यान दें?', 'How do I improve?': 'सुधार कैसे करें?',
};
export const t = (text: string) => language === 'hi' ? HI[text] ?? text : text;
const SETUP: Record<string, string[]> = {
  'countermovement-jump': ['कैमरा बगल से, कूल्हे की ऊँचाई पर लगभग 3 मीटर दूर रखें। पूरे शरीर और ऊपर की जगह दिखनी चाहिए।', 'पैर कूल्हे की चौड़ाई पर रखें और पूरे परीक्षण में हाथ कूल्हों पर रखें।', 'आरामदायक गहराई तक जल्दी झुकें, सीधे ऊपर कूदें और उसी जगह उतरें।'],
  'bodyweight-squat': ['कैमरा बगल से रखें; सिर से पैर तक पूरा शरीर दिखना चाहिए।', 'पैर आरामदायक चौड़ाई पर रखें। घुटनों को पंजों की दिशा में रखें।', 'दर्द के बिना नियंत्रित ढंग से बैठें और फिर पूरे खड़े हों।'],
  'push-up': ['कैमरा बगल से रखें और पूरे शरीर को दिखाएँ।', 'हाथ कंधों के नीचे, शरीर सीधा और पैर की उँगलियाँ ज़मीन पर रखें।', 'नियंत्रित ढंग से नीचे जाएँ, फिर कोहनियाँ सीधी करके ऊपर आएँ। दर्द होने पर रुकें।'],
  'plank': ['कैमरा बगल से रखें। कोहनियाँ कंधों के नीचे और पैर की उँगलियाँ ज़मीन पर हों।', 'सिर, कूल्हे और एड़ियाँ एक सीधी रेखा में रखें और सामान्य साँस लें।', 'स्थिति बनाए रखें। कैमरे से शरीर गायब होने पर लगातार समय टूट जाएगा।'],
};
export const setupFor = (ex: ExerciseDef) => language === 'hi' ? SETUP[ex.id] ?? ex.setup : ex.setup;
