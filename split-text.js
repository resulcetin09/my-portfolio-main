// Split [data-split] elements into masked words so the timeline can slide
// each word up. Keeps the original text in aria-label so screen readers read
// the sentence, not a list of fragments.
export function splitWords(root = document) {
  root.querySelectorAll('[data-split]').forEach((el) => {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(/\s+/).forEach((word, i, arr) => {
      const mask = document.createElement('span');
      mask.className = 'w';
      mask.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.textContent = word;
      mask.append(inner);
      el.append(mask);
      if (i < arr.length - 1) el.append(' ');
    });
  });
}
