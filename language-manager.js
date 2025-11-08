// language-manager.js - ENHANCED VERSION
console.log("Enhanced Language manager loaded");

// Enhanced Cookie management functions
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = "expires=" + d.toUTCString();
  document.cookie =
    name +
    "=" +
    encodeURIComponent(value) +
    ";" +
    expires +
    ";path=/;SameSite=Lax";
  console.log("Cookie set:", name, value);
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      const value = decodeURIComponent(c.substring(nameEQ.length, c.length));
      console.log("Cookie found:", name, value);
      return value;
    }
  }
  console.log("Cookie not found:", name);
  return null;
}

// Enhanced language application with multiple fallbacks
function applyLanguage(langCode) {
  console.log("Attempting to apply language:", langCode);

  // Method 1: Google Translate dropdown
  const select = document.querySelector(".goog-te-combo");
  if (select) {
    if (select.value !== langCode) {
      console.log("Setting Google Translate to:", langCode);
      select.value = langCode;
      select.dispatchEvent(new Event("change"));
    }
    return true;
  }

  // Method 2: Direct cookie setting
  setCookie("googtrans", `/en/${langCode}`, 365);

  // Method 3: localStorage backup
  localStorage.setItem("selectedLanguage", langCode);
  localStorage.setItem("languageTimestamp", Date.now());

  console.log("Language applied through fallback methods:", langCode);
  return true;
}

// Monitor for language changes
function setupLanguageChangeMonitor() {
  console.log("Setting up enhanced language change monitor");

  // Monitor dropdown changes more aggressively
  setInterval(() => {
    const select = document.querySelector(".goog-te-combo");
    if (select && !select.hasAttribute("data-lang-monitored")) {
      console.log("Monitoring language dropdown");
      select.setAttribute("data-lang-monitored", "true");
      select.addEventListener("change", function () {
        const newLang = this.value;
        console.log("Language changed via dropdown to:", newLang);

        // Save to multiple locations
        setCookie("googtrans", `/en/${newLang}`, 365);
        localStorage.setItem("selectedLanguage", newLang);
        localStorage.setItem("languageTimestamp", Date.now());
      });
    }
  }, 500);
}

// Enhanced initialization
function initializeLanguageSystem() {
  console.log("Initializing enhanced language system");

  // Check multiple storage locations
  const cookieLang = getCookie("googtrans");
  const storedLang = localStorage.getItem("selectedLanguage");
  const timestamp = localStorage.getItem("languageTimestamp");
  const isRecent = timestamp && Date.now() - parseInt(timestamp) < 300000; // 5 minutes

  let currentLang = "en";

  if (cookieLang && cookieLang.startsWith("/en/")) {
    currentLang = cookieLang.split("/")[2] || "en";
  } else if (storedLang && isRecent) {
    currentLang = storedLang;
    // Sync cookie with localStorage
    setCookie("googtrans", `/en/${currentLang}`, 365);
  }

  console.log("Determined current language:", currentLang);

  setupLanguageChangeMonitor();

  // Apply language aggressively
  if (currentLang !== "en") {
    console.log("Aggressively applying language:", currentLang);

    let attempts = 0;
    const maxAttempts = 30;

    const applyLanguageInterval = setInterval(() => {
      attempts++;
      applyLanguage(currentLang);

      if (attempts >= maxAttempts) {
        clearInterval(applyLanguageInterval);
        console.log(
          "Stopped language application attempts after",
          attempts,
          "tries"
        );
      }
    }, 500);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeLanguageSystem);
} else {
  initializeLanguageSystem();
}
