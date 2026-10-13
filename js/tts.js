/**
 * System TTS using Web Speech API
 */
class TTSController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.speaking = false;
    this.paused = false;
    this.currentText = '';
    this.onEnd = null;
    this.onStart = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.voice = null;
    
    // Load preferred Korean voice when available
    if (this.synth) {
      this.synth.onvoiceschanged = () => this.pickVoice();
      this.pickVoice();
    }
  }
  
  pickVoice() {
    const voices = this.synth.getVoices();
    // Prefer Korean
    const ko = voices.find(v => v.lang.startsWith('ko'));
    if (ko) {
      this.voice = ko;
      return;
    }
    // Fallback any
    this.voice = voices.find(v => v.default) || voices[0] || null;
  }
  
  isSupported() {
    return !!this.synth;
  }
  
  speak(text, options = {}) {
    if (!this.synth) return false;
    
    this.stop();
    
    // Clean text a bit
    const clean = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30000); // safety limit
    
    if (!clean) return false;
    
    this.currentText = clean;
    this.utterance = new SpeechSynthesisUtterance(clean);
    this.utterance.rate = options.rate || this.rate;
    this.utterance.pitch = options.pitch || this.pitch;
    this.utterance.lang = 'ko-KR';
    if (this.voice) this.utterance.voice = this.voice;
    
    this.utterance.onstart = () => {
      this.speaking = true;
      this.paused = false;
      if (this.onStart) this.onStart();
    };
    
    this.utterance.onend = () => {
      this.speaking = false;
      this.paused = false;
      if (this.onEnd) this.onEnd();
    };
    
    this.utterance.onerror = () => {
      this.speaking = false;
      this.paused = false;
      if (this.onEnd) this.onEnd();
    };
    
    this.synth.speak(this.utterance);
    return true;
  }
  
  pause() {
    if (this.synth && this.speaking && !this.paused) {
      this.synth.pause();
      this.paused = true;
    }
  }
  
  resume() {
    if (this.synth && this.paused) {
      this.synth.resume();
      this.paused = false;
    }
  }
  
  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.speaking = false;
    this.paused = false;
    this.utterance = null;
  }
  
  toggle(text) {
    if (this.speaking && !this.paused) {
      this.pause();
      return 'paused';
    }
    if (this.paused) {
      this.resume();
      return 'resumed';
    }
    // Start new
    const ok = this.speak(text);
    return ok ? 'started' : 'unsupported';
  }
  
  isSpeaking() {
    return this.speaking && !this.paused;
  }
  
  isPaused() {
    return this.paused;
  }
}

window.SeojaeTTS = new TTSController();
