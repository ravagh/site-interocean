/**
 * Business inquiry form
 *  - client-side validation with inline messages + an error summary (WCAG 3.3.1/3.3.3)
 *  - states: idle → submitting → success | error | unavailable
 *  - never fakes success: without VITE_FORM_ENDPOINT (or when the endpoint
 *    answers 503 "not configured") the visitor is told the message was NOT
 *    sent (and offered email, if VITE_CONTACT_EMAIL is set)
 *  - endpoint: /api/contact (Vercel function → Resend), see api/contact.js
 *  - deep links: /contact/?type=supplier&interest=Solar%20panels
 */
import { FORM } from './config.js';
import { $, $$ } from './utils/dom.js';
import { COUNTRY_CODES } from './components/countries.js';

const INQUIRY_TYPES = {
  product: 'Product Inquiry',
  supplier: 'Supplier Proposal',
  partnership: 'Business Partnership',
  general: 'General Inquiry',
};

const MESSAGES = {
  required: (label) => `Please enter your ${label.toLowerCase()}.`,
  choose: () => 'Please choose the type of inquiry.',
  email: () => 'Please enter a valid business email, like name@company.com.',
  minlength: (label, min) => `Your ${label.toLowerCase()} should be at least ${min} characters.`,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initContactForm(form) {
  const status = $('[data-form-status]', form);
  const summary = $('[data-form-summary]', form);
  const submit = $('[type="submit"]', form);
  const fields = $$('[data-field]', form);
  const touched = new WeakSet();

  populateCountries(form);
  prefillFromQuery(form);

  /* ---- Validation ---------------------------------------------------------- */
  const labelOf = (field) => field.dataset.label || $('label, legend', field)?.textContent.replace('*', '').trim() || 'field';

  function validateField(field) {
    const label = labelOf(field);
    const radios = $$('input[type="radio"]', field);
    let message = '';

    if (radios.length) {
      if (field.hasAttribute('data-required') && !radios.some((r) => r.checked)) message = MESSAGES.choose();
    } else {
      const input = $('input, textarea, select', field);
      const value = input.value.trim();
      const min = Number(input.getAttribute('minlength')) || 0;
      if (input.required && !value) message = MESSAGES.required(label);
      else if (value && input.type === 'email' && !EMAIL_RE.test(value)) message = MESSAGES.email();
      else if (value && min && value.length < min) message = MESSAGES.minlength(label, min);
    }

    setFieldError(field, message);
    return !message;
  }

  function setFieldError(field, message) {
    const error = $('[data-error]', field);
    const controls = $$('input, textarea, select', field);
    field.classList.toggle('is-invalid', Boolean(message));
    controls.forEach((c) => (message ? c.setAttribute('aria-invalid', 'true') : c.removeAttribute('aria-invalid')));
    if (error) error.textContent = message;
  }

  fields.forEach((field) => {
    const controls = $$('input, textarea, select', field);
    controls.forEach((control) => {
      control.addEventListener('blur', () => {
        if (control.value.trim() || touched.has(field)) {
          touched.add(field);
          validateField(field);
        }
      });
      control.addEventListener('input', () => {
        if (field.classList.contains('is-invalid')) validateField(field);
      });
      control.addEventListener('change', () => {
        if (control.type === 'radio') validateField(field);
      });
    });
  });

  function showSummary(invalid) {
    if (!summary) return;
    const list = $('ul', summary);
    list.innerHTML = '';
    invalid.forEach((field) => {
      const target = $('input, textarea, select', field);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${target.id}`;
      a.textContent = $('[data-error]', field).textContent;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        target.focus();
      });
      li.append(a);
      list.append(li);
    });
    summary.hidden = false;
    summary.focus();
  }

  /* ---- Status messages ----------------------------------------------------- */
  function setStatus(type, html) {
    form.dataset.state = type;
    if (!status) return;
    status.hidden = !html;
    status.className = `form-status form-status--${type}`;
    status.innerHTML = html || '';
  }

  function setBusy(busy) {
    form.setAttribute('aria-busy', String(busy));
    submit.disabled = busy;
    submit.classList.toggle('is-loading', busy);
    const label = $('.btn__label', submit);
    if (label) label.textContent = busy ? 'Sending…' : submit.dataset.label || 'Send Inquiry';
  }

  function payload() {
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.website; // honeypot
    data.inquiryTypeLabel = INQUIRY_TYPES[data.inquiryType] || data.inquiryType;
    data.page = location.href;
    data.submittedAt = new Date().toISOString();
    return data;
  }

  function mailtoHref(data) {
    const subject = `${data.inquiryTypeLabel || 'Inquiry'} — ${data.company || data.name}`;
    const body = [
      `Name: ${data.name}`,
      `Company: ${data.company}`,
      `Email: ${data.email}`,
      `Country: ${data.country}`,
      `Type of inquiry: ${data.inquiryTypeLabel}`,
      `Product or business interest: ${data.interest}`,
      data.quantity ? `Estimated quantity: ${data.quantity}` : '',
      '',
      data.message,
    ]
      .filter((line) => line !== '')
      .join('\n');
    return `mailto:${FORM.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /* ---- Submit -------------------------------------------------------------- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('idle', '');
    if (summary) summary.hidden = true;

    const invalid = fields.filter((field) => !validateField(field));
    fields.forEach((f) => touched.add(f));
    if (invalid.length) {
      showSummary(invalid);
      return;
    }

    // Honeypot: real visitors never see or fill this field.
    if ($('[name="website"]', form)?.value) return;

    const data = payload();

    const showUnavailable = () => {
      const alt = FORM.email
        ? `You can send the same details by email to <a href="${mailtoHref(data)}">${FORM.email}</a> — your message will open pre-filled in your email app.`
        : 'Please check back soon, or reach out through another channel you already use with Inter Ocean.';
      setStatus(
        'unavailable',
        `<strong>Your inquiry has not been sent.</strong> Online submission isn't available at the moment. ${alt}`,
      );
    };

    if (!FORM.endpoint) {
      showUnavailable();
      status?.focus();
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FORM.timeoutMs);
    const emailAlt = FORM.email ? ` You can also email us at <a href="${mailtoHref(data)}">${FORM.email}</a>.` : '';
    let focusTarget = status;
    try {
      const res = await fetch(FORM.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const result = await res.json().catch(() => ({}));

      if (res.ok) {
        form.reset();
        fields.forEach((f) => setFieldError(f, ''));
        setStatus('success', '<strong>Thank you — your inquiry has been sent.</strong> The Inter Ocean team will review it and get back to you.');
      } else if (res.status === 400 && result.fields) {
        // Server-side validation mirrors the client rules; show its messages inline.
        const invalid = [];
        fields.forEach((field) => {
          const control = $('input, textarea, select', field);
          const message = result.fields[control?.name];
          setFieldError(field, message || '');
          if (message) invalid.push(field);
        });
        setStatus('idle', '');
        if (invalid.length) {
          showSummary(invalid);
          focusTarget = null;
        }
      } else if (res.status === 503) {
        showUnavailable();
      } else if (res.status === 429) {
        setStatus('error', `<strong>Too many submissions.</strong> Please wait a few minutes and try again.${emailAlt}`);
      } else {
        throw new Error(`HTTP ${res.status}${result.error ? ` (${result.error})` : ''}`);
      }
    } catch (error) {
      setStatus('error', `<strong>We couldn't send your inquiry.</strong> Please check your connection and try again.${emailAlt}`);
      console.error('[contact form]', error);
    } finally {
      clearTimeout(timer);
      setBusy(false);
      focusTarget?.focus();
    }
  });
}

/* ---- Helpers -------------------------------------------------------------- */
function populateCountries(form) {
  const list = $('#country-list', form);
  if (!list || !('DisplayNames' in Intl)) return;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const entries = COUNTRY_CODES.map((code) => names.of(code)).filter(Boolean);
  const unique = [...new Set(entries)].sort((a, b) => a.localeCompare(b, 'en'));
  // United States first — priority market.
  const us = names.of('US');
  list.innerHTML = [us, ...unique.filter((n) => n !== us)].map((n) => `<option value="${n}"></option>`).join('');
}

function prefillFromQuery(form) {
  const params = new URLSearchParams(location.search);
  const type = params.get('type');
  if (type && INQUIRY_TYPES[type]) {
    const radio = $(`input[name="inquiryType"][value="${type}"]`, form);
    if (radio) radio.checked = true;
  }
  const interest = params.get('interest');
  const interestInput = $('[name="interest"]', form);
  if (interest && interestInput && !interestInput.value) interestInput.value = interest.slice(0, 160);
}
