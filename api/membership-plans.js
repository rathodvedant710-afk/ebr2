export const MEMBERSHIP_PLANS = [
  {
    id: 'prive-silver',
    name: 'LUXORA Privé Silver',
    tier: 'Silver',
    tagline: 'Complimentary Tier',
    price: 0,
    interval: 'lifetime',
    currency: 'INR',
    features: [
      'Standard 2-4 day shipping across India',
      'Seasonal catalog previews',
      'Online order tracking & digital receipts',
      'Standard customer care'
    ],
    badge: 'Current Basic',
    isPopular: false
  },
  {
    id: 'prive-gold',
    name: 'LUXORA Privé Gold',
    tier: 'Gold',
    tagline: 'Curated Elegance & Priority Access',
    price: 999,
    interval: 'year',
    currency: 'INR',
    features: [
      'Extra 10% off automatically applied on all orders',
      'Complimentary BlueDart Air Express shipping',
      '48-hour early access to new seasonal silhouettes & sales',
      'Complimentary luxury cotton dust bag with every order',
      'Dedicated WhatsApp VIP concierge desk'
    ],
    badge: 'Most Popular',
    isPopular: true
  },
  {
    id: 'prive-platinum',
    name: 'LUXORA Privé Atelier VIP',
    tier: 'Platinum',
    tagline: 'The Ultimate Haute Maroquinerie Experience',
    price: 2499,
    interval: 'year',
    currency: 'INR',
    features: [
      'Extra 20% off all catalog items year-round',
      'Complimentary White-Glove VIP Delivery across metro cities',
      'Free customized initials foil-monogramming on select leather goods',
      '1-on-1 personal stylist & private appointment bookings',
      'Exclusive invitation to secret archive sales & atelier launches',
      'Handcrafted signature silk scarf with first luxury purchase'
    ],
    badge: 'Atelier Elite',
    isPopular: false
  }
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  res.statusCode = 200;
  return res.json({
    success: true,
    currency: 'INR',
    plans: MEMBERSHIP_PLANS
  });
}
