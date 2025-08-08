import PocketBase from 'https://esm.sh/pocketbase';

const pb = new PocketBase('http://170.9.3.173:8080');

const form = document.getElementById('contactForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const message = document.getElementById('message').value.trim();

  try {
    await pb.collection('messages').create({ name, email, message });

    alert('Message sent successfully!');
    form.reset();
  } catch (err) {
    console.error('Submission error:', err);
    alert('Failed to send message.');
  }
});