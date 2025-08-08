import PocketBase from 'https://cdn.jsdelivr.net/npm/pocketbase@0.18.4/+esm';

const pb = new PocketBase('http://170.9.3.173:8080/');

const form = document.querySelector('.contact-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.querySelector('#fullName').value;
  const email = document.querySelector('#email').value;
  const message = document.querySelector('#message').value;

  try {
    await pb.collection('messages').create({ name, email, message });

    alert('Message sent successfully!');
    form.reset();
  } catch (err) {
    console.error('Submission error:', err.response || err);
    alert('Failed to send message.');
  }
});
