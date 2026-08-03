const nodemailer = require('nodemailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, subject, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Missing GMAIL_USER / GMAIL_APP_PASSWORD environment variables.');
    return res.status(500).json({ error: 'Email is not configured on the server yet.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"DigiRidge Website" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: email,
      subject: `New contact form message: ${subject || 'No subject'}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || '-'}\n\nMessage:\n${message}`,
      html: `<p><strong>Name:</strong> ${name}</p>` +
            `<p><strong>Email:</strong> ${email}</p>` +
            `<p><strong>Subject:</strong> ${subject || '-'}</p>` +
            `<p><strong>Message:</strong><br>${String(message).replace(/\n/g, '<br>')}</p>`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact form email error:', err);
    return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
};
