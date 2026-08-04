const nodemailer = require('nodemailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, subject, service, message } = req.body || {};

  if (!name || !email || !phone || !message) {
    return res.status(400).json({ error: 'Name, email, mobile number and message are required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid mobile number.' });
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Missing GMAIL_USER / GMAIL_APP_PASSWORD environment variables.');
    return res.status(500).json({ error: 'Email is not configured on the server yet.' });
  }

  const emailSubject = service
    ? `New quote request: ${service}`
    : `New contact form message: ${subject || 'No subject'}`;

  const textLines = [`Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`];
  if (service) textLines.push(`Requested Service: ${service}`);
  if (subject) textLines.push(`Subject: ${subject}`);
  textLines.push('', 'Message:', message);

  const htmlParts = [
    `<p><strong>Name:</strong> ${name}</p>`,
    `<p><strong>Email:</strong> ${email}</p>`,
    `<p><strong>Phone:</strong> ${phone}</p>`,
  ];
  if (service) htmlParts.push(`<p><strong>Requested Service:</strong> ${service}</p>`);
  if (subject) htmlParts.push(`<p><strong>Subject:</strong> ${subject}</p>`);
  htmlParts.push(`<p><strong>Message:</strong><br>${String(message).replace(/\n/g, '<br>')}</p>`);

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"DigiRidge Website" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: email,
      subject: emailSubject,
      text: textLines.join('\n'),
      html: htmlParts.join(''),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact form email error:', err);
    return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
};
