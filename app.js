const $ = selector => document.querySelector(selector);
const state = { places: [], query: '', apiKey: '', missingWebsiteOnly: false, activeMissingWebsiteOnly: false, pages: [], nextPageTokens: [], pageIndex: 0, nextPageToken: '', seenPlaceIds: new Set() };
const PLACES_API = 'https://places.googleapis.com/v1';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function savedKey() {
  return state.apiKey;
}
async function placesFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'X-Goog-Api-Key':savedKey(), ...(options.headers || {}) },
    signal:AbortSignal.timeout(25000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Google Places returned HTTP ${response.status}.`;
    if (/referer|referrer|API key not authorized|REQUEST_DENIED/i.test(message)) {
      throw new Error(`${message} Check that this website's origin is allowed under Website restrictions and Places API (New) is allowed under API restrictions.`);
    }
    throw new Error(message);
  }
  return data;
}
function setStatus(message, type = '') {
  const el = $('#status');
  el.textContent = message;
  el.className = `status ${type}`;
  el.classList.toggle('hidden', !message);
}
function updateKeyStatus() {
  $('#key-status').textContent = savedKey() ? 'API key active in this tab' : 'API key not set';
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}
function siteQuality(report) {
  const flags = [report.status >= 400, !report.https, !report.viewport, !report.title, !report.description, !report.h1Count, report.imagesMissingAlt > 0].filter(Boolean).length;
  if (flags >= 4) return { label:'Several technical issues found', css:'high', count:flags };
  if (flags >= 2) return { label:'Some technical issues found', css:'medium', count:flags };
  return { label:'No major technical issues detected', css:'low', count:flags };
}
function renderCard(place, index) {
  const name = place.displayName || 'Unnamed place';
  const address = place.formattedAddress || 'Address not listed';
  const mapsLink = safeUrl(place.googleMapsURI) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  const website = safeUrl(place.websiteURI);
  const details = place.detailsLoaded ? `<div class="place-details"><p><b>Phone</b> ${place.nationalPhoneNumber ? `<a href="tel:${esc(place.nationalPhoneNumber)}">${esc(place.nationalPhoneNumber)}</a>` : 'Not listed'}</p><p><b>Website</b> ${website ? `<a href="${esc(website)}" target="_blank" rel="noreferrer">${esc(new URL(website).hostname)} ↗</a>` : 'Not listed'}</p></div>` : '';
  const pageSpeedLink = website ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(website)}` : '';
  return `<article class="lead-card place-card"><div class="place-number">${index + 1}</div><div class="place-main"><h3 class="lead-name">${esc(name)}</h3>${place.primaryTypeDisplayName ? `<div class="lead-type">${esc(place.primaryTypeDisplayName)}</div>` : ''}<p class="lead-address">${esc(address)}</p><div class="lead-actions"><a class="text-button small" href="${esc(mapsLink)}" target="_blank" rel="noreferrer">Open in Google Maps ↗</a><button class="text-button small details-button" data-index="${index}" type="button" ${place.detailsLoading ? 'disabled' : ''}>${place.detailsLoading ? 'Loading details…' : place.detailsLoaded ? 'Refresh phone & website' : 'Show phone & website · Details'}</button>${place.detailsLoaded && website ? `<a class="text-button small" href="${esc(pageSpeedLink)}" target="_blank" rel="noreferrer">Check site with PageSpeed ↗</a>` : ''}</div>${details}${place.detailsError ? `<p class="audit-error">${esc(place.detailsError)}</p>` : ''}</div></article>`;
}
function renderResults() {
  const grid = $('#results-grid');
  grid.innerHTML = state.places.map(renderCard).join('');
  $('#results-title').textContent = state.query;
  $('#results-subtitle').textContent = `Page ${state.pageIndex + 1} · ${state.places.length} shown · ${state.seenPlaceIds.size} unique businesses loaded${state.activeMissingWebsiteOnly ? ' without a website listed on Google Maps' : ''} · temporary results`;
  $('#previous-page').disabled = state.pageIndex === 0;
  $('#next-page').disabled = !state.nextPageToken;
  $('#next-page').textContent = state.nextPageToken ? 'Next 20 businesses →' : 'No more pages from Google';
  $('#page-indicator').textContent = `Page ${state.pageIndex + 1}`;
  $('#pagination-note').textContent = state.nextPageToken
    ? 'Each new page makes one more Google Places search. Repeated business IDs are automatically skipped.'
    : 'Google did not return another page token for this search. Try a more specific nearby area or a different query.';
  grid.querySelectorAll('.details-button').forEach(button => button.addEventListener('click', () => loadDetails(Number(button.dataset.index))));
}
async function requestPage(pageToken = '') {
  const type = $('#business-type').value.trim();
  const location = $('#location').value.trim();
  if (!state.query) state.query = `${type} in ${location}`;
  if (!state.query.trim()) return;
  if (!savedKey()) {
    $('#settings-status').textContent = 'Paste and save your API key before searching.';
    $('#settings-dialog').showModal();
    return;
  }
  const searchButton = $('#search-button');
  searchButton.disabled = true;
  const pageButton = pageToken ? $('#next-page') : null;
  if (pageButton) pageButton.disabled = true;
  setStatus(pageToken ? 'Loading the next 20 Google Places results…' : 'Searching Google Places…', 'loading');
  try {
    const fieldMask = ['places.id','places.displayName','places.formattedAddress','places.primaryTypeDisplayName','places.googleMapsUri','nextPageToken'];
    if (state.activeMissingWebsiteOnly) fieldMask.push('places.websiteUri');
    const data = await placesFetch(`${PLACES_API}/places:searchText`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-Goog-FieldMask':fieldMask.join(',') },
      body:JSON.stringify({ textQuery:state.query, pageSize:20, ...(pageToken ? {pageToken} : {}), languageCode:'en' })
    });
    let found = data.places || [];
    if (state.activeMissingWebsiteOnly) found = found.filter(place => !safeUrl(place.websiteUri || ''));
    found = found.filter(place => {
      if (!place.id || state.seenPlaceIds.has(place.id)) return false;
      state.seenPlaceIds.add(place.id);
      return true;
    });
    state.places = found.map(place => ({
      id:place.id,
      displayName:place.displayName?.text || '',
      formattedAddress:place.formattedAddress || '',
      primaryTypeDisplayName:place.primaryTypeDisplayName?.text || '',
      googleMapsURI:place.googleMapsUri || '',
      websiteURI:place.websiteUri || '',
      detailsLoaded: false,
      detailsLoading: false,
      detailsError: ''
    }));
    state.nextPageToken = data.nextPageToken || '';
    state.pages[state.pageIndex] = state.places;
    state.nextPageTokens[state.pageIndex] = state.nextPageToken;
    $('#results-section').classList.remove('hidden');
    if (!state.places.length) {
      const title = pageToken ? 'No new businesses on this page.' : (state.activeMissingWebsiteOnly ? 'No businesses without a listed website in this result set.' : 'No places found.');
      $('#results-grid').innerHTML = `<div class="empty-state"><h3>${title}</h3><p>${state.nextPageToken ? 'Use Next page to continue. Results repeated by Google are removed automatically.' : 'Try a nearby area or a more specific business type.'} A missing Google website field does not prove that no website exists.</p></div>`;
      $('#results-title').textContent = state.query;
      $('#results-subtitle').textContent = `Page ${state.pageIndex + 1} · 0 new · ${state.seenPlaceIds.size} unique businesses loaded`;
      $('#previous-page').disabled = state.pageIndex === 0;
      $('#next-page').disabled = !state.nextPageToken;
      $('#next-page').textContent = state.nextPageToken ? 'Next 20 businesses →' : 'No more pages from Google';
      $('#page-indicator').textContent = `Page ${state.pageIndex + 1}`;
      $('#pagination-note').textContent = state.nextPageToken
        ? 'Google repeated places from an earlier page. They were skipped; use Next 20 to keep going.'
        : 'Google did not return another page token for this search. Try a more specific nearby area or a different query.';
    } else renderResults();
    setStatus(`Loaded page ${state.pageIndex + 1}: ${state.places.length} new ${state.places.length === 1 ? 'business' : 'businesses'}${state.activeMissingWebsiteOnly ? ' with no website listed' : ''}.`);
  } catch (error) {
    if (pageToken) {
      state.pageIndex = Math.max(0, state.pageIndex - 1);
      state.nextPageToken = state.nextPageTokens[state.pageIndex] || '';
    }
    setStatus(error.message || 'Google Places search failed. Check the key and Places API (New) setup.', 'error');
    if (state.pages[state.pageIndex]) { state.places = state.pages[state.pageIndex]; renderResults(); }
  } finally { searchButton.disabled = false; if (pageButton) pageButton.disabled = !state.nextPageToken; }
}
function searchPlaces() {
  const type = $('#business-type').value.trim();
  const location = $('#location').value.trim();
  if (!type || !location) return;
  state.query = `${type} in ${location}`;
  state.activeMissingWebsiteOnly = state.missingWebsiteOnly;
  state.pages = [];
  state.nextPageTokens = [];
  state.pageIndex = 0;
  state.nextPageToken = '';
  state.seenPlaceIds = new Set();
  return requestPage('');
}
function goToPreviousPage() {
  if (state.pageIndex <= 0) return;
  state.pageIndex--;
  state.places = state.pages[state.pageIndex] || [];
  state.nextPageToken = state.nextPageTokens[state.pageIndex] || '';
  renderResults();
  setStatus(`Showing page ${state.pageIndex + 1}; no new Google request was made.`);
}
function goToNextPage() {
  if (!state.nextPageToken) return;
  if (state.pages[state.pageIndex + 1]) {
    state.pageIndex++;
    state.places = state.pages[state.pageIndex];
    state.nextPageToken = state.nextPageTokens[state.pageIndex] || '';
    renderResults();
    setStatus(`Showing page ${state.pageIndex + 1}; no new Google request was made.`);
    return;
  }
  state.pageIndex++;
  return requestPage(state.nextPageTokens[state.pageIndex - 1]);
}
async function loadDetails(index) {
  const place = state.places[index];
  if (!place || place.detailsLoading) return;
  place.detailsLoading = true;
  place.detailsError = '';
  renderResults();
  try {
    const details = await placesFetch(`${PLACES_API}/places/${encodeURIComponent(place.id)}`, {
      headers:{ 'X-Goog-FieldMask':'nationalPhoneNumber,websiteUri' }
    });
    place.nationalPhoneNumber = details.nationalPhoneNumber || '';
    place.websiteURI = details.websiteUri || '';
    place.detailsLoaded = true;
  } catch (error) {
    place.detailsError = error.message || 'Could not load phone or website details.';
  } finally { place.detailsLoading = false; renderResults(); }
}
$('#search-form').addEventListener('submit', event => { event.preventDefault(); searchPlaces(); });
$('#previous-page').addEventListener('click', goToPreviousPage);
$('#next-page').addEventListener('click', goToNextPage);
$('#no-website-toggle').addEventListener('click', event => {
  const toggle = event.currentTarget;
  state.missingWebsiteOnly = toggle.getAttribute('aria-pressed') !== 'true';
  toggle.setAttribute('aria-pressed', String(state.missingWebsiteOnly));
});
$('#settings-button').addEventListener('click', () => {
  $('#api-key').value = savedKey();
  $('#settings-status').textContent = savedKey() ? 'A key is active in this tab until you close or refresh it.' : '';
  $('#settings-dialog').showModal();
});
$('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const key = $('#api-key').value.trim();
  if (!key) { $('#settings-status').textContent = 'Paste an API key first.'; return; }
  state.apiKey = key;
  updateKeyStatus();
  $('#settings-status').textContent = 'Key active in this tab only. It is not saved to browser storage.';
  setStatus('API key active in this tab only.');
  setTimeout(() => $('#settings-dialog').close(), 450);
});
$('#remove-key').addEventListener('click', () => {
  state.apiKey = '';
  $('#api-key').value = '';
  updateKeyStatus();
  $('#settings-status').textContent = 'Key removed from this tab.';
});
$('#toggle-key').addEventListener('click', () => {
  const input = $('#api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('#toggle-key').textContent = input.type === 'password' ? 'Show' : 'Hide';
});

updateKeyStatus();
