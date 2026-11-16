// Small helpers for building the page, plus dialogs and messages.
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith('on')) element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === 'class') element.className = value;
    else if (name in element && name !== 'list' && name !== 'form') element[name] = value;
    else element.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child);
  }
  return element;
}

let toastTimer;
export function toast(message, isError = false) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.toggle('is-error', isError);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, isError ? 7000 : 2800);
}

// Opens a modal and removes it from the page again once it closes.
export function showDialog(dialog) {
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  return dialog;
}

export function confirmDialog({ title, message, confirmLabel, danger }) {
  return new Promise((resolve) => {
    let answer = false;
    const dialog = h('dialog', { class: 'confirm-dialog', 'aria-label': title, onclose: () => resolve(answer) },
      h('div', { class: 'confirm' },
        h('div', { class: 'dialog-header' }, h('h2', {}, title)),
        message && h('div', { class: 'dialog-body' }, h('p', {}, message)),
        h('div', { class: 'dialog-footer' },
          h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
          h('button', {
            class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
            type: 'button',
            'data-confirm': true,
            onclick: () => { answer = true; dialog.close(); },
          }, confirmLabel))));
    showDialog(dialog);
  });
}

export function openLightbox(photos, startIndex, photoUrl, altText) {
  let index = startIndex;
  const image = h('img', {});
  const counter = h('span', { class: 'meta' });
  const show = () => {
    image.src = photoUrl(photos[index]);
    image.alt = `${altText}, photo ${index + 1} of ${photos.length}`;
    counter.textContent = `${index + 1} of ${photos.length}`;
  };
  const step = (delta) => {
    index = (index + delta + photos.length) % photos.length;
    show();
  };
  const several = photos.length > 1;
  const dialog = h('dialog', {
    class: 'lightbox',
    onclick: (event) => { if (event.target === dialog) dialog.close(); },
    onkeydown: (event) => {
      if (!several) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    },
  },
    h('div', { class: 'lightbox-inner' },
      image,
      h('div', { class: 'lightbox-bar' },
        counter,
        h('div', { class: 'btn-row' },
          several && h('button', { class: 'btn btn-small', type: 'button', onclick: () => step(-1) }, 'Previous'),
          several && h('button', { class: 'btn btn-small', type: 'button', onclick: () => step(1) }, 'Next'),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => dialog.close() }, 'Close')))));
  show();
  showDialog(dialog);
}
