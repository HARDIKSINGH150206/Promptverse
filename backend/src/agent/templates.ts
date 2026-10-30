// What the agent says at the safety-critical steps, written out per language. Code, not the model,
// speaks these, so a read-back or the safety checklist can't be reworded into something else.
// The checklist states the three conditions and asks "is all of that true?", so "yes" means safe.

export interface Words {
  plates: string; // "40 <plates> veg biryani"
  from: (name: string) => string;
  cooked: (t: string) => string;
  safe: (t: string) => string;
  pickup: (notes: string) => string;
  food: string;
  need: (people: number, name: string, diet: string, by: string, km?: number) => string;
  veg: string;
  nonveg: string;
  any: string;
}

export interface Lines {
  greetR: (n?: string) => string;
  greetD: (n?: string) => string;
  summaryR: (s: string, veg: boolean) => string;
  summaryD: (s: string) => string;
  checklist: (warn: string) => string;
  warnSafety: string;
  warnDiet: string;
  whatChange: string;
  repeatYesNo: string;
  giveUp: string;
  unsafeEnd: string;
  window: (h: number, cooked: string | null, latest: string | null) => string;
  cookedOld: (h: number) => string;
  live: string;
  liveD: string;
  liveOff: string;
  liveDOff: string;
  bye: string;
  byeD: string;
  byeOff: string;
  timeLimit: string;
  sayAgain: string;
  error: (m: string) => string;
  w: Words;
}

const en: Lines = {
  greetR: (n) => n ? `Hi ${n}, this is AnnaRelay. What food do you have left today?` : "Hi, this is AnnaRelay. You can talk to me in any Indian language. Which kitchen are you calling from, and what food do you have left today?",
  greetD: (n) => n ? `Hi ${n}, this is AnnaRelay. How many people do you need food for today?` : "Hi, this is AnnaRelay. You can talk to me in any Indian language. Which shelter are you calling from, and how many people do you need food for?",
  summaryR: (s, veg) => `Let me read that back: ${s}. Is that correct, and is everything ${veg ? "vegetarian" : "non-vegetarian"}? Please say yes or no.`,
  summaryD: (s) => `Let me read that back: ${s}. Shall I post this request? Please say yes or no.`,
  checklist: (warn) => `${warn}Last step, a quick safety check. The food was kept covered, kept hot or refrigerated, and never served on anyone's plate. Is all of that true? Please say yes or no.`,
  warnSafety: "Your description mentioned something that could affect safety. ",
  warnDiet: "The automatic diet check wasn't sure, so please double-check. ",
  whatChange: "No problem. What should I change?",
  repeatYesNo: "Sorry, I need a clear yes or no.",
  giveUp: "I couldn't get a clear yes or no, so I haven't listed anything. Please call again. Goodbye!",
  unsafeEnd: "Thanks for being careful. We can't send that food to people, so I won't list it. Goodbye!",
  window: (h, cooked, latest) => `${cooked ? `I have it as cooked at ${cooked}. ` : ""}Cooked food can only be listed for up to ${h} hours after cooking${latest ? `, so until ${latest} at the latest` : ""}. Until what time is it safe to eat?`,
  cookedOld: (h) => `That sounds like more than ${h} hours ago. What time was the food cooked?`,
  live: "Thank you! Your food is listed, and I'm finding the most reliable shelter now.",
  liveD: "Done, your request is live. I'll look for food near you now.",
  liveOff: "Thank you! Your food is listed. Matching is paused in this demo, so no shelter will be contacted.",
  liveDOff: "Done, your request is saved. Matching is paused in this demo, so no offers will be sent.",
  bye: "That's all. We'll keep you posted on Telegram. Thank you for helping. Goodbye!",
  byeD: "That's all for now. Offers will reach you on Telegram or your inbox. Goodbye!",
  byeOff: "That's all. Thank you for helping. Goodbye!",
  timeLimit: "We've reached the time limit for this call, so I'll stop here. Nothing new was listed. Goodbye!",
  sayAgain: "Sorry, could you say that again?",
  error: (m) => `Sorry, I couldn't save that: ${m}.`,
  w: {
    plates: "plates of",
    from: (n) => `from ${n}`,
    cooked: (t) => `cooked at ${t}`,
    safe: (t) => `safe until ${t}`,
    pickup: (n) => (/^pick/i.test(n) ? n.replace(/^\w/, (c) => c.toLowerCase()) : `pickup at ${n}`),
    food: "food",
    need: (p, name, diet, by, km) => `${diet} for ${p} people at ${name}, needed by ${by}${km ? `, within ${km} km` : ""}`,
    veg: "vegetarian food",
    nonveg: "non-veg food",
    any: "any food",
  },
};

const hi: Lines = {
  greetR: (n) => n ? `नमस्ते ${n}, मैं AnnaRelay से बोल रही हूँ। आज कौन सा खाना बचा है?` : "नमस्ते, मैं AnnaRelay से बोल रही हूँ। आप किस किचन से बोल रहे हैं, और आज कौन सा खाना बचा है?",
  greetD: (n) => n ? `नमस्ते ${n}, मैं AnnaRelay से बोल रही हूँ। आज कितने लोगों के लिए खाना चाहिए?` : "नमस्ते, मैं AnnaRelay से बोल रही हूँ। आप किस संस्था से हैं, और कितने लोगों के लिए खाना चाहिए?",
  summaryR: (s, veg) => `मैं दोहरा देती हूँ: ${s}। क्या यह सही है, और क्या सब कुछ ${veg ? "शाकाहारी" : "नॉन-वेज"} है? हाँ या ना बोलिए।`,
  summaryD: (s) => `मैं दोहरा देती हूँ: ${s}। क्या मैं यह अनुरोध डाल दूँ? हाँ या ना बोलिए।`,
  checklist: (warn) => `${warn}आख़िरी सवाल, सुरक्षा के लिए। खाना ढका हुआ था, गरम या फ्रिज में रखा था, और किसी की प्लेट में परोसा नहीं गया था। क्या ये सब सही है? हाँ या ना बोलिए।`,
  warnSafety: "आपकी बात में कुछ ऐसा था जो सुरक्षा पर असर डाल सकता है। ",
  warnDiet: "डाइट की जाँच पक्की नहीं है, कृपया ध्यान से बताइए। ",
  whatChange: "कोई बात नहीं। क्या बदलना है?",
  repeatYesNo: "माफ़ कीजिए, साफ़ हाँ या ना बोलिए।",
  giveUp: "साफ़ हाँ या ना नहीं मिल पाया, इसलिए मैंने कुछ भी लिस्ट नहीं किया। कृपया दोबारा कॉल कीजिए। नमस्ते!",
  unsafeEnd: "सावधानी के लिए धन्यवाद। यह खाना लोगों को नहीं भेज सकते, इसलिए लिस्ट नहीं करूँगी। नमस्ते!",
  window: (h, cooked, latest) => `${cooked ? `मेरे पास खाना ${cooked} पर बना लिखा है। ` : ""}पका हुआ खाना बनने के ${h} घंटे तक ही लिस्ट हो सकता है${latest ? `, यानी ज़्यादा से ज़्यादा ${latest} तक` : ""}। खाना कितने बजे तक खाने लायक है?`,
  cookedOld: (h) => `यह ${h} घंटे से ज़्यादा पहले लगता है। खाना कितने बजे बना था?`,
  live: "धन्यवाद! आपका खाना लिस्ट हो गया है, अब मैं सबसे भरोसेमंद संस्था ढूँढ रही हूँ।",
  liveD: "हो गया, आपका अनुरोध लाइव है। अब मैं पास में खाना ढूँढती हूँ।",
  liveOff: "धन्यवाद! आपका खाना लिस्ट हो गया है। इस डेमो में मैचिंग बंद है, इसलिए किसी संस्था से संपर्क नहीं होगा।",
  liveDOff: "हो गया, आपका अनुरोध सेव हो गया है। इस डेमो में मैचिंग बंद है, इसलिए कोई ऑफ़र नहीं भेजा जाएगा।",
  bye: "बस इतना ही। हम Telegram पर बताते रहेंगे। धन्यवाद, नमस्ते!",
  byeD: "अभी के लिए बस। ऑफ़र Telegram या इनबॉक्स पर आएँगे। नमस्ते!",
  byeOff: "बस इतना ही। मदद के लिए धन्यवाद, नमस्ते!",
  timeLimit: "इस कॉल का समय पूरा हो गया, इसलिए मैं यहीं रुकती हूँ। कुछ नया लिस्ट नहीं हुआ। नमस्ते!",
  sayAgain: "माफ़ कीजिए, फिर से बोलिए?",
  error: (m) => `माफ़ कीजिए, सेव नहीं हो पाया: ${m}।`,
  w: {
    plates: "प्लेट",
    from: (n) => `${n} से`,
    cooked: (t) => `${t} पर बना`,
    safe: (t) => `${t} तक सुरक्षित`,
    pickup: (n) => `पिकअप: ${n}`,
    food: "खाना",
    need: (p, name, diet, by, km) => `${name} के ${p} लोगों के लिए ${diet}, ${by} तक${km ? `, ${km} किलोमीटर के अंदर` : ""}`,
    veg: "शाकाहारी खाना",
    nonveg: "नॉन-वेज खाना",
    any: "कोई भी खाना",
  },
};

const kn: Lines = {
  greetR: (n) => n ? `ನಮಸ್ಕಾರ ${n}, ನಾನು AnnaRelay ಇಂದ ಮಾತಾಡ್ತಿದ್ದೀನಿ. ಇವತ್ತು ಯಾವ ಊಟ ಉಳಿದಿದೆ?` : "ನಮಸ್ಕಾರ, ನಾನು AnnaRelay ಇಂದ ಮಾತಾಡ್ತಿದ್ದೀನಿ. ನೀವು ಯಾವ ಅಡುಗೆಮನೆಯಿಂದ ಕರೆ ಮಾಡ್ತಿದ್ದೀರಿ, ಇವತ್ತು ಯಾವ ಊಟ ಉಳಿದಿದೆ?",
  greetD: (n) => n ? `ನಮಸ್ಕಾರ ${n}, ನಾನು AnnaRelay ಇಂದ ಮಾತಾಡ್ತಿದ್ದೀನಿ. ಇವತ್ತು ಎಷ್ಟು ಜನರಿಗೆ ಊಟ ಬೇಕು?` : "ನಮಸ್ಕಾರ, ನಾನು AnnaRelay ಇಂದ ಮಾತಾಡ್ತಿದ್ದೀನಿ. ನೀವು ಯಾವ ಸಂಸ್ಥೆಯಿಂದ ಕರೆ ಮಾಡ್ತಿದ್ದೀರಿ, ಎಷ್ಟು ಜನರಿಗೆ ಊಟ ಬೇಕು?",
  summaryR: (s, veg) => `ಒಮ್ಮೆ ಓದಿ ಹೇಳ್ತೀನಿ: ${s}. ಇದು ಸರಿನಾ, ಮತ್ತು ಎಲ್ಲವೂ ${veg ? "ಸಸ್ಯಾಹಾರ" : "ಮಾಂಸಾಹಾರ"}ನಾ? ಹೌದು ಅಥವಾ ಇಲ್ಲ ಅಂತ ಹೇಳಿ.`,
  summaryD: (s) => `ಒಮ್ಮೆ ಓದಿ ಹೇಳ್ತೀನಿ: ${s}. ಈ ಮನವಿಯನ್ನು ಹಾಕಲಾ? ಹೌದು ಅಥವಾ ಇಲ್ಲ ಅಂತ ಹೇಳಿ.`,
  checklist: (warn) => `${warn}ಕೊನೆಯ ಪ್ರಶ್ನೆ, ಸುರಕ್ಷತೆಗಾಗಿ. ಊಟ ಮುಚ್ಚಿ ಇಟ್ಟಿತ್ತು, ಬಿಸಿಯಾಗಿ ಅಥವಾ ಫ್ರಿಜ್‌ನಲ್ಲಿ ಇಟ್ಟಿತ್ತು, ಮತ್ತು ಯಾರ ತಟ್ಟೆಗೂ ಬಡಿಸಿರಲಿಲ್ಲ. ಇದೆಲ್ಲಾ ಸರಿನಾ? ಹೌದು ಅಥವಾ ಇಲ್ಲ ಅಂತ ಹೇಳಿ.`,
  warnSafety: "ನೀವು ಹೇಳಿದ್ದರಲ್ಲಿ ಸುರಕ್ಷತೆಗೆ ತೊಂದರೆ ಆಗಬಹುದಾದ ಏನೋ ಇತ್ತು. ",
  warnDiet: "ಆಹಾರದ ಪ್ರಕಾರದ ಸ್ವಯಂ ಪರಿಶೀಲನೆ ಖಚಿತವಾಗಿಲ್ಲ, ದಯವಿಟ್ಟು ಒಮ್ಮೆ ಗಮನಿಸಿ. ",
  whatChange: "ಪರವಾಗಿಲ್ಲ. ಏನು ಬದಲಾಯಿಸಬೇಕು?",
  repeatYesNo: "ಕ್ಷಮಿಸಿ, ಸ್ಪಷ್ಟವಾಗಿ ಹೌದು ಅಥವಾ ಇಲ್ಲ ಅಂತ ಹೇಳಿ.",
  giveUp: "ಸ್ಪಷ್ಟ ಉತ್ತರ ಸಿಗಲಿಲ್ಲ, ಹಾಗಾಗಿ ನಾನು ಏನನ್ನೂ ಲಿಸ್ಟ್ ಮಾಡಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಕರೆ ಮಾಡಿ. ನಮಸ್ಕಾರ!",
  unsafeEnd: "ಎಚ್ಚರಿಕೆಗೆ ಧನ್ಯವಾದ. ಈ ಊಟವನ್ನು ಜನರಿಗೆ ಕಳಿಸೋಕೆ ಆಗಲ್ಲ, ಹಾಗಾಗಿ ಲಿಸ್ಟ್ ಮಾಡಲ್ಲ. ನಮಸ್ಕಾರ!",
  window: (h, cooked, latest) => `${cooked ? `ಊಟ ${cooked}ಕ್ಕೆ ಮಾಡಿದ್ದು ಅಂತ ಬರೆದುಕೊಂಡಿದ್ದೀನಿ. ` : ""}ಬೇಯಿಸಿದ ಊಟವನ್ನು ಮಾಡಿದ ${h} ಗಂಟೆಯೊಳಗೆ ಮಾತ್ರ ಲಿಸ್ಟ್ ಮಾಡಬಹುದು${latest ? `, ಅಂದರೆ ಹೆಚ್ಚೆಂದರೆ ${latest}ವರೆಗೆ` : ""}. ಊಟ ಎಷ್ಟು ಗಂಟೆವರೆಗೆ ತಿನ್ನಲು ಸುರಕ್ಷಿತ?`,
  cookedOld: (h) => `ಅದು ${h} ಗಂಟೆಗಿಂತ ಹೆಚ್ಚು ಹಿಂದೆ ಅನ್ನಿಸುತ್ತೆ. ಊಟ ಎಷ್ಟು ಗಂಟೆಗೆ ಮಾಡಿದ್ದು?`,
  live: "ಧನ್ಯವಾದ! ನಿಮ್ಮ ಊಟ ಲಿಸ್ಟ್ ಆಗಿದೆ, ಈಗ ಅತ್ಯಂತ ವಿಶ್ವಾಸಾರ್ಹ ಸಂಸ್ಥೆಯನ್ನು ಹುಡುಕ್ತಿದ್ದೀನಿ.",
  liveD: "ಆಯ್ತು, ನಿಮ್ಮ ಮನವಿ ಲೈವ್ ಆಗಿದೆ. ಈಗ ಹತ್ತಿರದಲ್ಲಿ ಊಟ ಹುಡುಕ್ತೀನಿ.",
  liveOff: "ಧನ್ಯವಾದ! ನಿಮ್ಮ ಊಟ ಲಿಸ್ಟ್ ಆಗಿದೆ. ಈ ಡೆಮೋದಲ್ಲಿ ಮ್ಯಾಚಿಂಗ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ, ಹಾಗಾಗಿ ಯಾವ ಸಂಸ್ಥೆಯನ್ನೂ ಸಂಪರ್ಕಿಸಲ್ಲ.",
  liveDOff: "ಆಯ್ತು, ನಿಮ್ಮ ಮನವಿ ಸೇವ್ ಆಗಿದೆ. ಈ ಡೆಮೋದಲ್ಲಿ ಮ್ಯಾಚಿಂಗ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ, ಹಾಗಾಗಿ ಯಾವ ಆಫರ್ ಕೂಡ ಬರಲ್ಲ.",
  bye: "ಇಷ್ಟೇ. Telegram ನಲ್ಲಿ ತಿಳಿಸ್ತೀವಿ. ಸಹಾಯಕ್ಕೆ ಧನ್ಯವಾದ, ನಮಸ್ಕಾರ!",
  byeD: "ಸದ್ಯಕ್ಕೆ ಇಷ್ಟೇ. ಆಫರ್‌ಗಳು Telegram ಅಥವಾ ಇನ್‌ಬಾಕ್ಸ್‌ಗೆ ಬರುತ್ತೆ. ನಮಸ್ಕಾರ!",
  byeOff: "ಇಷ್ಟೇ. ಸಹಾಯಕ್ಕೆ ಧನ್ಯವಾದ, ನಮಸ್ಕಾರ!",
  timeLimit: "ಈ ಕರೆಯ ಸಮಯ ಮುಗಿದಿದೆ, ಹಾಗಾಗಿ ಇಲ್ಲಿಗೆ ನಿಲ್ಲಿಸ್ತೀನಿ. ಹೊಸದಾಗಿ ಏನೂ ಲಿಸ್ಟ್ ಆಗಿಲ್ಲ. ನಮಸ್ಕಾರ!",
  sayAgain: "ಕ್ಷಮಿಸಿ, ಇನ್ನೊಮ್ಮೆ ಹೇಳ್ತೀರಾ?",
  error: (m) => `ಕ್ಷಮಿಸಿ, ಸೇವ್ ಮಾಡೋಕೆ ಆಗಲಿಲ್ಲ: ${m}.`,
  w: {
    plates: "ಪ್ಲೇಟ್",
    from: (n) => `${n} ಇಂದ`,
    cooked: (t) => `${t}ಕ್ಕೆ ಮಾಡಿದ್ದು`,
    safe: (t) => `${t}ವರೆಗೆ ಸುರಕ್ಷಿತ`,
    pickup: (n) => `ಪಿಕಪ್: ${n}`,
    food: "ಊಟ",
    need: (p, name, diet, by, km) => `${name}ನಲ್ಲಿ ${p} ಜನರಿಗೆ ${diet}, ${by}ಒಳಗೆ${km ? `, ${km} ಕಿಲೋಮೀಟರ್ ಒಳಗೆ` : ""}`,
    veg: "ಸಸ್ಯಾಹಾರಿ ಊಟ",
    nonveg: "ಮಾಂಸಾಹಾರಿ ಊಟ",
    any: "ಯಾವುದೇ ಊಟ",
  },
};

const ta: Lines = {
  greetR: (n) => n ? `வணக்கம் ${n}, நான் AnnaRelay-இலிருந்து பேசுகிறேன். இன்று என்ன உணவு மீதம் இருக்கிறது?` : "வணக்கம், நான் AnnaRelay-இலிருந்து பேசுகிறேன். நீங்கள் எந்த சமையலறையிலிருந்து பேசுகிறீர்கள், இன்று என்ன உணவு மீதம் இருக்கிறது?",
  greetD: (n) => n ? `வணக்கம் ${n}, நான் AnnaRelay-இலிருந்து பேசுகிறேன். இன்று எத்தனை பேருக்கு உணவு வேண்டும்?` : "வணக்கம், நான் AnnaRelay-இலிருந்து பேசுகிறேன். நீங்கள் எந்த அமைப்பிலிருந்து பேசுகிறீர்கள், எத்தனை பேருக்கு உணவு வேண்டும்?",
  summaryR: (s, veg) => `ஒருமுறை சொல்கிறேன்: ${s}. இது சரியா, எல்லாமே ${veg ? "சைவம்" : "அசைவம்"} தானா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`,
  summaryD: (s) => `ஒருமுறை சொல்கிறேன்: ${s}. இந்த கோரிக்கையைப் பதிவு செய்யட்டுமா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`,
  checklist: (warn) => `${warn}கடைசி கேள்வி, பாதுகாப்புக்காக. உணவு மூடி வைக்கப்பட்டது, சூடாக அல்லது குளிர்சாதனப் பெட்டியில் வைக்கப்பட்டது, யாருடைய தட்டிலும் பரிமாறப்படவில்லை. இவை எல்லாம் சரியா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`,
  warnSafety: "நீங்கள் சொன்னதில் பாதுகாப்பைப் பாதிக்கக்கூடிய ஒன்று இருந்தது. ",
  warnDiet: "உணவு வகையின் தானியங்கி சோதனை உறுதியாக இல்லை, தயவுசெய்து சரிபார்க்கவும். ",
  whatChange: "பரவாயில்லை. எதை மாற்ற வேண்டும்?",
  repeatYesNo: "மன்னிக்கவும், தெளிவாக ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.",
  giveUp: "தெளிவான பதில் கிடைக்கவில்லை, அதனால் எதையும் பட்டியலிடவில்லை. தயவுசெய்து மீண்டும் அழையுங்கள். நன்றி!",
  unsafeEnd: "கவனத்திற்கு நன்றி. இந்த உணவை மக்களுக்கு அனுப்ப முடியாது, அதனால் பட்டியலிட மாட்டேன். நன்றி!",
  window: (h, cooked, latest) => `${cooked ? `உணவு ${cooked} மணிக்கு சமைக்கப்பட்டது என்று குறித்துள்ளேன். ` : ""}சமைத்த உணவை சமைத்த ${h} மணி நேரத்திற்குள் மட்டுமே பட்டியலிட முடியும்${latest ? `, அதாவது அதிகபட்சம் ${latest} வரை` : ""}. உணவு எத்தனை மணி வரை சாப்பிட பாதுகாப்பானது?`,
  cookedOld: (h) => `அது ${h} மணி நேரத்திற்கு முன்பு போல் தெரிகிறது. உணவு எத்தனை மணிக்கு சமைக்கப்பட்டது?`,
  live: "நன்றி! உங்கள் உணவு பட்டியலிடப்பட்டது, இப்போது மிக நம்பகமான அமைப்பைத் தேடுகிறேன்.",
  liveD: "முடிந்தது, உங்கள் கோரிக்கை நேரலையில் உள்ளது. இப்போது அருகில் உணவைத் தேடுகிறேன்.",
  liveOff: "நன்றி! உங்கள் உணவு பட்டியலிடப்பட்டது. இந்த டெமோவில் பொருத்துதல் நிறுத்தப்பட்டுள்ளது, அதனால் எந்த அமைப்பையும் தொடர்பு கொள்ள மாட்டோம்.",
  liveDOff: "முடிந்தது, உங்கள் கோரிக்கை சேமிக்கப்பட்டது. இந்த டெமோவில் பொருத்துதல் நிறுத்தப்பட்டுள்ளது, அதனால் எந்த சலுகையும் அனுப்பப்படாது.",
  bye: "அவ்வளவுதான். Telegram-இல் தெரிவிப்போம். உதவிக்கு நன்றி, வணக்கம்!",
  byeD: "இப்போதைக்கு அவ்வளவுதான். சலுகைகள் Telegram அல்லது இன்பாக்ஸில் வரும். வணக்கம்!",
  byeOff: "அவ்வளவுதான். உதவிக்கு நன்றி, வணக்கம்!",
  timeLimit: "இந்த அழைப்பின் நேரம் முடிந்தது, அதனால் இங்கே நிறுத்துகிறேன். புதிதாக எதுவும் பட்டியலிடப்படவில்லை. வணக்கம்!",
  sayAgain: "மன்னிக்கவும், மீண்டும் சொல்ல முடியுமா?",
  error: (m) => `மன்னிக்கவும், சேமிக்க முடியவில்லை: ${m}.`,
  w: {
    plates: "தட்டு",
    from: (n) => `${n}-இலிருந்து`,
    cooked: (t) => `${t} மணிக்கு சமைத்தது`,
    safe: (t) => `${t} வரை பாதுகாப்பானது`,
    pickup: (n) => `எடுக்கும் இடம்: ${n}`,
    food: "உணவு",
    need: (p, name, diet, by, km) => `${name}-இல் ${p} பேருக்கு ${diet}, ${by}க்குள்${km ? `, ${km} கிலோமீட்டருக்குள்` : ""}`,
    veg: "சைவ உணவு",
    nonveg: "அசைவ உணவு",
    any: "எந்த உணவும்",
  },
};

const te: Lines = {
  greetR: (n) => n ? `నమస్కారం ${n}, నేను AnnaRelay నుండి మాట్లాడుతున్నాను. ఈ రోజు ఏ ఆహారం మిగిలింది?` : "నమస్కారం, నేను AnnaRelay నుండి మాట్లాడుతున్నాను. మీరు ఏ వంటశాల నుండి మాట్లాడుతున్నారు, ఈ రోజు ఏ ఆహారం మిగిలింది?",
  greetD: (n) => n ? `నమస్కారం ${n}, నేను AnnaRelay నుండి మాట్లాడుతున్నాను. ఈ రోజు ఎంతమందికి ఆహారం కావాలి?` : "నమస్కారం, నేను AnnaRelay నుండి మాట్లాడుతున్నాను. మీరు ఏ సంస్థ నుండి మాట్లాడుతున్నారు, ఎంతమందికి ఆహారం కావాలి?",
  summaryR: (s, veg) => `ఒకసారి చదివి చెబుతాను: ${s}. ఇది సరైనదేనా, అంతా ${veg ? "శాకాహారమేనా" : "మాంసాహారమేనా"}? అవును లేదా కాదు అని చెప్పండి.`,
  summaryD: (s) => `ఒకసారి చదివి చెబుతాను: ${s}. ఈ అభ్యర్థనను పోస్ట్ చేయనా? అవును లేదా కాదు అని చెప్పండి.`,
  checklist: (warn) => `${warn}చివరి ప్రశ్న, భద్రత కోసం. ఆహారం మూత పెట్టి ఉంచారు, వేడిగా లేదా ఫ్రిజ్‌లో ఉంచారు, ఎవరి ప్లేట్‌లోనూ వడ్డించలేదు. ఇవన్నీ నిజమేనా? అవును లేదా కాదు అని చెప్పండి.`,
  warnSafety: "మీరు చెప్పినదానిలో భద్రతను ప్రభావితం చేసే విషయం ఉంది. ",
  warnDiet: "ఆహార రకం ఆటోమేటిక్ తనిఖీ ఖచ్చితంగా లేదు, దయచేసి ఒకసారి చూసుకోండి. ",
  whatChange: "పర్వాలేదు. ఏమి మార్చాలి?",
  repeatYesNo: "క్షమించండి, స్పష్టంగా అవును లేదా కాదు అని చెప్పండి.",
  giveUp: "స్పష్టమైన సమాధానం రాలేదు, అందుకే ఏదీ లిస్ట్ చేయలేదు. దయచేసి మళ్ళీ కాల్ చేయండి. నమస్కారం!",
  unsafeEnd: "జాగ్రత్తకు ధన్యవాదాలు. ఈ ఆహారాన్ని ప్రజలకు పంపలేము, అందుకే లిస్ట్ చేయను. నమస్కారం!",
  window: (h, cooked, latest) => `${cooked ? `ఆహారం ${cooked}కి వండారని రాసుకున్నాను. ` : ""}వండిన ఆహారాన్ని వండిన ${h} గంటల లోపు మాత్రమే లిస్ట్ చేయవచ్చు${latest ? `, అంటే గరిష్టంగా ${latest} వరకు` : ""}. ఆహారం ఎన్ని గంటల వరకు తినడానికి సురక్షితం?`,
  cookedOld: (h) => `అది ${h} గంటల కంటే ముందు అనిపిస్తోంది. ఆహారం ఎన్ని గంటలకు వండారు?`,
  live: "ధన్యవాదాలు! మీ ఆహారం లిస్ట్ అయింది, ఇప్పుడు అత్యంత నమ్మకమైన సంస్థను వెతుకుతున్నాను.",
  liveD: "అయిపోయింది, మీ అభ్యర్థన లైవ్‌లో ఉంది. ఇప్పుడు దగ్గరలో ఆహారం వెతుకుతాను.",
  liveOff: "ధన్యవాదాలు! మీ ఆహారం లిస్ట్ అయింది. ఈ డెమోలో మ్యాచింగ్ ఆపివేయబడింది, అందుకే ఏ సంస్థనూ సంప్రదించము.",
  liveDOff: "అయిపోయింది, మీ అభ్యర్థన సేవ్ అయింది. ఈ డెమోలో మ్యాచింగ్ ఆపివేయబడింది, అందుకే ఏ ఆఫర్లూ పంపబడవు.",
  bye: "అంతే. Telegram లో తెలియజేస్తాము. సహాయానికి ధన్యవాదాలు, నమస్కారం!",
  byeD: "ప్రస్తుతానికి అంతే. ఆఫర్లు Telegram లేదా ఇన్‌బాక్స్‌కి వస్తాయి. నమస్కారం!",
  byeOff: "అంతే. సహాయానికి ధన్యవాదాలు, నమస్కారం!",
  timeLimit: "ఈ కాల్ సమయం ముగిసింది, అందుకే ఇక్కడ ఆపుతున్నాను. కొత్తగా ఏదీ లిస్ట్ కాలేదు. నమస్కారం!",
  sayAgain: "క్షమించండి, మళ్ళీ చెప్పగలరా?",
  error: (m) => `క్షమించండి, సేవ్ చేయలేకపోయాను: ${m}.`,
  w: {
    plates: "ప్లేట్లు",
    from: (n) => `${n} నుండి`,
    cooked: (t) => `${t}కి వండినది`,
    safe: (t) => `${t} వరకు సురక్షితం`,
    pickup: (n) => `పికప్: ${n}`,
    food: "ఆహారం",
    need: (p, name, diet, by, km) => `${name}లో ${p} మందికి ${diet}, ${by} లోపు${km ? `, ${km} కిలోమీటర్ల లోపు` : ""}`,
    veg: "శాకాహారం",
    nonveg: "మాంసాహారం",
    any: "ఏ ఆహారమైనా",
  },
};

const mr: Lines = {
  greetR: (n) => n ? `नमस्कार ${n}, मी AnnaRelay मधून बोलतेय. आज कोणतं जेवण उरलं आहे?` : "नमस्कार, मी AnnaRelay मधून बोलतेय. तुम्ही कोणत्या किचनमधून बोलताय, आणि आज कोणतं जेवण उरलं आहे?",
  greetD: (n) => n ? `नमस्कार ${n}, मी AnnaRelay मधून बोलतेय. आज किती लोकांसाठी जेवण हवं आहे?` : "नमस्कार, मी AnnaRelay मधून बोलतेय. तुम्ही कोणत्या संस्थेतून बोलताय, आणि किती लोकांसाठी जेवण हवं आहे?",
  summaryR: (s, veg) => `मी एकदा वाचून दाखवते: ${s}. हे बरोबर आहे का, आणि सगळं ${veg ? "शाकाहारी" : "मांसाहारी"} आहे का? हो किंवा नाही सांगा.`,
  summaryD: (s) => `मी एकदा वाचून दाखवते: ${s}. ही विनंती टाकू का? हो किंवा नाही सांगा.`,
  checklist: (warn) => `${warn}शेवटचा प्रश्न, सुरक्षिततेसाठी. जेवण झाकून ठेवलं होतं, गरम किंवा फ्रिजमध्ये ठेवलं होतं, आणि कोणाच्याही ताटात वाढलं नव्हतं. हे सगळं खरं आहे का? हो किंवा नाही सांगा.`,
  warnSafety: "तुम्ही सांगितलेल्यात सुरक्षिततेवर परिणाम करणारं काहीतरी होतं. ",
  warnDiet: "आहाराची आपोआप तपासणी खात्रीशीर नाही, कृपया एकदा तपासा. ",
  whatChange: "काही हरकत नाही. काय बदलायचं?",
  repeatYesNo: "माफ करा, स्पष्ट हो किंवा नाही सांगा.",
  giveUp: "स्पष्ट उत्तर मिळालं नाही, म्हणून मी काहीही लिस्ट केलं नाही. कृपया पुन्हा कॉल करा. नमस्कार!",
  unsafeEnd: "काळजी घेतल्याबद्दल धन्यवाद. हे जेवण लोकांना पाठवता येणार नाही, म्हणून लिस्ट करणार नाही. नमस्कार!",
  window: (h, cooked, latest) => `${cooked ? `माझ्याकडे जेवण ${cooked} ला बनवलं असं लिहिलं आहे. ` : ""}शिजवलेलं जेवण बनवल्यापासून ${h} तासांपर्यंतच लिस्ट करता येतं${latest ? `, म्हणजे जास्तीत जास्त ${latest} पर्यंत` : ""}. जेवण किती वाजेपर्यंत खाण्यायोग्य आहे?`,
  cookedOld: (h) => `ते ${h} तासांपेक्षा जास्त आधी वाटतं. जेवण किती वाजता बनवलं होतं?`,
  live: "धन्यवाद! तुमचं जेवण लिस्ट झालं आहे, आता मी सर्वात विश्वासार्ह संस्था शोधतेय.",
  liveD: "झालं, तुमची विनंती लाइव्ह आहे. आता जवळपास जेवण शोधते.",
  liveOff: "धन्यवाद! तुमचं जेवण लिस्ट झालं आहे. या डेमोमध्ये मॅचिंग बंद आहे, म्हणून कोणत्याही संस्थेशी संपर्क होणार नाही.",
  liveDOff: "झालं, तुमची विनंती सेव्ह झाली आहे. या डेमोमध्ये मॅचिंग बंद आहे, म्हणून कोणतीही ऑफर पाठवली जाणार नाही.",
  bye: "एवढंच. Telegram वर कळवत राहू. मदतीबद्दल धन्यवाद, नमस्कार!",
  byeD: "सध्या एवढंच. ऑफर Telegram किंवा इनबॉक्सवर येतील. नमस्कार!",
  byeOff: "एवढंच. मदतीबद्दल धन्यवाद, नमस्कार!",
  timeLimit: "या कॉलची वेळ संपली, म्हणून मी इथे थांबते. नवीन काहीही लिस्ट झालं नाही. नमस्कार!",
  sayAgain: "माफ करा, पुन्हा सांगाल का?",
  error: (m) => `माफ करा, सेव्ह करता आलं नाही: ${m}.`,
  w: {
    plates: "प्लेट",
    from: (n) => `${n} कडून`,
    cooked: (t) => `${t} ला बनवलेलं`,
    safe: (t) => `${t} पर्यंत सुरक्षित`,
    pickup: (n) => `पिकअप: ${n}`,
    food: "जेवण",
    need: (p, name, diet, by, km) => `${name} मधल्या ${p} लोकांसाठी ${diet}, ${by} पर्यंत${km ? `, ${km} किलोमीटरच्या आत` : ""}`,
    veg: "शाकाहारी जेवण",
    nonveg: "मांसाहारी जेवण",
    any: "कोणतंही जेवण",
  },
};

const bn: Lines = {
  greetR: (n) => n ? `নমস্কার ${n}, আমি AnnaRelay থেকে বলছি। আজ কী খাবার বেঁচে আছে?` : "নমস্কার, আমি AnnaRelay থেকে বলছি। আপনি কোন রান্নাঘর থেকে বলছেন, আর আজ কী খাবার বেঁচে আছে?",
  greetD: (n) => n ? `নমস্কার ${n}, আমি AnnaRelay থেকে বলছি। আজ কতজনের জন্য খাবার দরকার?` : "নমস্কার, আমি AnnaRelay থেকে বলছি। আপনি কোন সংস্থা থেকে বলছেন, আর কতজনের জন্য খাবার দরকার?",
  summaryR: (s, veg) => `একবার পড়ে শোনাই: ${s}। এটা কি ঠিক, আর সবকিছু কি ${veg ? "নিরামিষ" : "আমিষ"}? হ্যাঁ অথবা না বলুন।`,
  summaryD: (s) => `একবার পড়ে শোনাই: ${s}। এই অনুরোধটা পোস্ট করব? হ্যাঁ অথবা না বলুন।`,
  checklist: (warn) => `${warn}শেষ প্রশ্ন, নিরাপত্তার জন্য। খাবার ঢাকা ছিল, গরম বা ফ্রিজে রাখা ছিল, আর কারও থালায় পরিবেশন করা হয়নি। এসব কি সত্যি? হ্যাঁ অথবা না বলুন।`,
  warnSafety: "আপনার কথায় এমন কিছু ছিল যা নিরাপত্তায় প্রভাব ফেলতে পারে। ",
  warnDiet: "খাবারের ধরনের স্বয়ংক্রিয় যাচাই নিশ্চিত নয়, অনুগ্রহ করে একবার দেখে নিন। ",
  whatChange: "কোনো অসুবিধা নেই। কী বদলাতে হবে?",
  repeatYesNo: "মাফ করবেন, পরিষ্কার করে হ্যাঁ অথবা না বলুন।",
  giveUp: "পরিষ্কার উত্তর পাইনি, তাই কিছুই তালিকাভুক্ত করিনি। অনুগ্রহ করে আবার কল করুন। নমস্কার!",
  unsafeEnd: "সতর্কতার জন্য ধন্যবাদ। এই খাবার মানুষের কাছে পাঠানো যাবে না, তাই তালিকাভুক্ত করব না। নমস্কার!",
  window: (h, cooked, latest) => `${cooked ? `আমার কাছে লেখা আছে খাবার ${cooked}-এ রান্না হয়েছিল। ` : ""}রান্না করা খাবার রান্নার ${h} ঘণ্টার মধ্যেই তালিকাভুক্ত করা যায়${latest ? `, মানে বড়জোর ${latest} পর্যন্ত` : ""}। খাবার কটা পর্যন্ত খাওয়ার জন্য নিরাপদ?`,
  cookedOld: (h) => `এটা ${h} ঘণ্টার বেশি আগে মনে হচ্ছে। খাবার কটায় রান্না হয়েছিল?`,
  live: "ধন্যবাদ! আপনার খাবার তালিকাভুক্ত হয়েছে, এখন সবচেয়ে নির্ভরযোগ্য সংস্থা খুঁজছি।",
  liveD: "হয়ে গেছে, আপনার অনুরোধ লাইভ। এখন কাছাকাছি খাবার খুঁজছি।",
  liveOff: "ধন্যবাদ! আপনার খাবার তালিকাভুক্ত হয়েছে। এই ডেমোতে ম্যাচিং বন্ধ, তাই কোনো সংস্থার সঙ্গে যোগাযোগ করা হবে না।",
  liveDOff: "হয়ে গেছে, আপনার অনুরোধ সেভ হয়েছে। এই ডেমোতে ম্যাচিং বন্ধ, তাই কোনো অফার পাঠানো হবে না।",
  bye: "এটুকুই। Telegram-এ জানাতে থাকব। সাহায্যের জন্য ধন্যবাদ, নমস্কার!",
  byeD: "আপাতত এটুকুই। অফার Telegram বা ইনবক্সে আসবে। নমস্কার!",
  byeOff: "এটুকুই। সাহায্যের জন্য ধন্যবাদ, নমস্কার!",
  timeLimit: "এই কলের সময় শেষ, তাই এখানেই থামছি। নতুন কিছু তালিকাভুক্ত হয়নি। নমস্কার!",
  sayAgain: "মাফ করবেন, আবার বলবেন?",
  error: (m) => `মাফ করবেন, সেভ করা গেল না: ${m}।`,
  w: {
    plates: "প্লেট",
    from: (n) => `${n} থেকে`,
    cooked: (t) => `${t}-এ রান্না`,
    safe: (t) => `${t} পর্যন্ত নিরাপদ`,
    pickup: (n) => `পিকআপ: ${n}`,
    food: "খাবার",
    need: (p, name, diet, by, km) => `${name}-এর ${p} জনের জন্য ${diet}, ${by}-এর মধ্যে${km ? `, ${km} কিলোমিটারের মধ্যে` : ""}`,
    veg: "নিরামিষ খাবার",
    nonveg: "আমিষ খাবার",
    any: "যেকোনো খাবার",
  },
};

const LINES: Record<string, Lines> = { en, hi, kn, ta, te, mr, bn };

/** Fixed lines for a call language; languages without their own set fall back to English. */
export function lines(language: string | null | undefined): Lines {
  return LINES[(language ?? "en").split(/[-_]/)[0].toLowerCase()] ?? en;
}

/** True if the safety-critical lines exist in this language (otherwise they are spoken in English). */
export function hasLines(language: string | null | undefined): boolean {
  return (language ?? "en").split(/[-_]/)[0].toLowerCase() in LINES;
}
