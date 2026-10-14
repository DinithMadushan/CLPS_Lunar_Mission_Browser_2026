export function showPopup(title, content) {
  let card = document.getElementById('popup-card');

  if (!card) {
    card = document.createElement('div');
    card.id = 'popup-card';

    card.style.position = 'absolute';
    card.style.bottom = '20px';
    card.style.right = '20px';
    card.style.background = 'rgba(15, 23, 42, 0.9)';
    card.style.color = '#ffffff';
    card.style.padding = '15px 20px';
    card.style.borderRadius = '10px';
    card.style.border = '1px solid #00ffcc';
    card.style.fontFamily = 'sans-serif';
    card.style.zIndex = '1000';
    card.style.maxWidth = '320px';

    document.body.appendChild(card);
  }

  card.innerHTML = `
    <h3 style="margin:0 0 8px 0; color:#00ffcc;">
      ${title}
    </h3>
    <p style="margin:0; font-size:14px; line-height:1.5;">
      ${content}
    </p>
  `;
}