const handleWebhook = (req, res) => {
  const data = req.body;
  console.log('Received webhook data:', data);
  res.status(200).json({ message: 'Webhook received successfully', data });
};

module.exports = {
  handleWebhook,
};
