export const profileSections = [
  { title: 'Account', rows: [
    { label: 'Manage Profile', icon: 'person-circle-outline', screen: 'ManageProfile' },
    { label: 'Password & Security', icon: 'lock-closed-outline', screen: 'PasswordSecurity' },
    { label: 'Notifications', icon: 'notifications-outline', screen: 'ProfileNotifications' },
    { label: 'Language', icon: 'language-outline', screen: 'ProfileLanguage' },
    { label: 'Refer & earn', icon: 'gift-outline', screen: 'ReferAndEarn' },
  ] },
  { title: 'Support', rows: [
    { label: 'FAQ', icon: 'help-circle-outline', screen: 'ProfileFAQ' },
    { label: 'Contact Support', icon: 'headset-outline', screen: 'ContactSupport' },
    { label: 'About Us', icon: 'reader-outline', screen: 'AboutUs' },
  ] },
] as const;

type FAQItem = {
  id: string; title: string; category: string;
  icon: 'car-outline' | 'location-outline' | 'shield-checkmark-outline' | 'wallet-outline' | 'close-circle-outline' | 'person-circle-outline' | 'finger-print-outline' | 'musical-notes-outline' | 'language-outline';
  answer: string;
  steps: { title: string; body: string }[];
  details: { title: string; body: string }[];
  tip: { title: string; body: string };
  related: string[];
};

export const faqItems: FAQItem[] = [
  {
    id: 'book', title: 'How do I book a ride?', category: 'Booking a ride', icon: 'car-outline',
    answer: 'Start from Home and tell Zipp where you want to go. You can review your pickup, destination, ride option, and fare before confirming.',
    steps: [
      { title: 'Choose your destination', body: 'Tap Book a ride or Where to? on Home. Enter a place or landmark and select a search result so Zipp can find its position on the map.' },
      { title: 'Check your pickup', body: 'Select your pickup point. Search for a nearby place, choose a point on the map, or tap My location and allow location access when prompted.' },
      { title: 'Review your ride', body: 'Choose Everyday, Comfort, or Premium. Check both stops, the displayed road route, and the fare for the selected option.' },
      { title: 'Check your wallet and confirm', body: 'Make sure your available wallet balance covers the entire fare. Confirm to open the driver and vehicle details, then follow the arrival information on the map.' },
    ],
    details: [{ title: 'If a route does not appear', body: 'Check your internet connection and confirm that both stops have map locations. If routing fails, tap the route retry message or adjust the pickup and destination. A typed label alone may not provide a map location.' }],
    tip: { title: 'Before you confirm', body: 'Use a recognizable pickup landmark and double-check the destination. This helps avoid confusion when meeting your driver.' },
    related: ['pickup', 'wallet', 'pin'],
  },
  {
    id: 'pickup', title: 'How do I change my pickup location?', category: 'Booking a ride', icon: 'location-outline',
    answer: 'You can adjust the pickup before confirming your ride. Choose a place that is easy to recognize and safe to reach.',
    steps: [
      { title: 'Open the pickup field', body: 'On the booking screen, tap the pickup field to search for a different address or landmark.' },
      { title: 'Choose the right location', body: 'Select a search suggestion to use its map position. You can also choose your pickup on the map and confirm the selected point.' },
      { title: 'Use your current location if needed', body: 'Tap My location and allow foreground location access. Check the selected point carefully, especially if you are indoors or close to several entrances.' },
      { title: 'Review the updated route', body: 'Check the pickup label and map position before confirming the ride. Make sure the point is on the side of the road where you can meet the vehicle.' },
    ],
    details: [{ title: 'If location access is unavailable', body: 'You can still search for a landmark or choose a point on the map. If you prefer GPS, enable your phone’s location service and allow Zipp location access, then try My location again.' }, { title: 'After confirming a ride', body: 'The current booking flow does not offer pickup editing after confirmation. Check the cancellation information before canceling and making another booking.' }],
    tip: { title: 'Choose a clear meeting point', body: 'A named entrance or a nearby landmark is usually easier to identify than a general area or a large building with several exits.' },
    related: ['book', 'cancel'],
  },
  {
    id: 'pin', title: 'When should I share my trip PIN?', category: 'Your trip', icon: 'shield-checkmark-outline',
    answer: 'Share your four-digit trip PIN only after checking the driver and vehicle and getting inside the correct car. The PIN is used to verify the trip before it starts.',
    steps: [
      { title: 'Wait for the arrival screen', body: 'When the driver arrives, the trip screen displays your PIN and the information you need to meet the vehicle.' },
      { title: 'Match the vehicle details', body: 'Check the vehicle model, color, number plate, and driver information against the details in Zipp.' },
      { title: 'Get inside the correct vehicle', body: 'If the details match and you are comfortable proceeding, enter the vehicle before sharing the PIN with the driver.' },
      { title: 'Let the driver verify the PIN', body: 'The driver verifies your PIN before the ride starts. You do not need to press a Start ride button in the passenger app.' },
    ],
    details: [{ title: 'If the details do not match', body: 'Do not share the PIN or enter the vehicle. Recheck the trip details and use the available safety and support options if you need help.' }, { title: 'Trip PIN versus sign-in code', body: 'Your trip PIN is for the driver of that trip. Your sign-in verification code and account password are private and should never be shared with a driver.' }],
    tip: { title: 'Keep the PIN private until you are ready', body: 'Avoid sending your PIN ahead of arrival or sharing it with anyone who is not the driver shown for your trip.' },
    related: ['book', 'cancel'],
  },
  {
    id: 'wallet', title: 'How do wallet payments work?', category: 'Payments', icon: 'wallet-outline',
    answer: 'A ride uses your available Zipp Wallet balance. The fare is reserved when you confirm, then settled after the trip finishes.',
    steps: [
      { title: 'Check your available balance', body: 'Open your wallet from Home. Available balance is the amount you can use for a new booking after any active fare reservations.' },
      { title: 'Review the fare', body: 'Select your ride option and compare the fare with your available balance. The entire fare must be available before you can confirm.' },
      { title: 'Understand the reservation', body: 'Confirmation reserves the fare so it cannot be spent on another booking. A reservation reduces your available balance; it is not an additional charge on top of the trip fare.' },
      { title: 'Check the payment result', body: 'At the end of the trip, wait for payment processing to finish and review the receipt. A paid receipt appears only after settlement succeeds.' },
    ],
    details: [{ title: 'If your balance is too low', body: 'The balance panel shows your available funds, the ride fare, and the amount you still need. It provides access to wallet top-up. Check that funds are actually available before trying to confirm again.' }, { title: 'If payment is pending', body: 'A pending receipt does not mean the ride has been paid. Review the payment message and use the available retry option. Keep the trip details when preparing a support request.' }],
    tip: { title: 'About the current preview', body: 'Development wallet funds, top-ups, and ride charges are demonstrations. They do not move real money or confirm a payment with a bank or mobile-money provider.' },
    related: ['cancel', 'sounds'],
  },
  {
    id: 'cancel', title: 'Can I cancel a ride?', category: 'Your trip', icon: 'close-circle-outline',
    answer: 'You can cancel while the driver is arriving or has arrived, before the ride starts. Review the cancellation fee in the confirmation window before deciding.',
    steps: [
      { title: 'Open your active booking', body: 'Go to the trip screen while the driver is arriving or waiting at pickup.' },
      { title: 'Tap Cancel ride', body: 'Zipp opens a confirmation window showing the cancellation charge. Opening this window does not cancel the ride.' },
      { title: 'Review the amount', body: 'Check the fee before accepting. In the current preview, the fee is 25% of the selected fare, rounded to a whole XAF.' },
      { title: 'Confirm your decision', body: 'Accept cancellation to end the booking. The fee is deducted from the reserved fare and the remaining reservation is released back to your available balance. Dismiss the window to keep the ride.' },
    ],
    details: [{ title: 'Example in the preview', body: 'For a sample fare of 2,000 XAF, the cancellation fee is 500 XAF. The remaining 1,500 XAF of the reserved fare becomes available again.' }, { title: 'After the ride starts', body: 'The pre-trip cancellation option is no longer available. Use Safety & support on the trip screen if you need help with an ongoing ride.' }],
    tip: { title: 'Always check the displayed fee', body: 'The confirmation window is the place to review the amount before accepting. Preview charges are simulated and do not move real money.' },
    related: ['wallet', 'pickup'],
  },
  {
    id: 'account', title: 'How do I update my details?', category: 'Your account', icon: 'person-circle-outline',
    answer: 'Manage your name, email address, and phone number from Profile. Saved changes appear in your profile and update the name used around the app.',
    steps: [
      { title: 'Open Manage Profile', body: 'Tap Profile in the main navigation bar, then tap Manage Profile. You can also tap the identity card at the top of Profile.' },
      { title: 'Edit your details', body: 'Enter your preferred name, add or update your email address, and check your phone number. Use an email address you can access if you plan to prepare a support request.' },
      { title: 'Check the fields', body: 'Your name cannot be empty. If you enter an email address, it must be in a valid format. Your phone number must contain a valid number of digits.' },
      { title: 'Save your changes', body: 'Tap Save changes and wait for the confirmation screen. Tap Done to return to Profile and review the updated details.' },
    ],
    details: [{ title: 'Changing your password', body: 'Password settings are separate from your profile details. Open Password & Security, then Change password. Enter your current password, choose a different password with at least eight characters, and confirm it.' }, { title: 'How long changes are kept', body: 'Profile edits currently last for the app session. Password changes in development are a local preview and do not change a live account password. Editing your phone number is not a new phone-verification step.' }],
    tip: { title: 'Keep account details private', body: 'Do not include passwords, verification codes, or your trip PIN in a support message.' },
    related: ['unlock', 'language'],
  },
  {
    id: 'unlock', title: 'How do I enable fingerprint or face unlock?', category: 'Your account', icon: 'finger-print-outline',
    answer: 'Biometric unlock protects your current Zipp session when you leave the app. Your phone verifies your fingerprint or face; Zipp does not receive your biometric data.',
    steps: [
      { title: 'Check your phone setup', body: 'Set up fingerprint or supported face recognition in your phone’s security settings first.' },
      { title: 'Open the unlock settings', body: 'In Profile, open Password & Security, then Fingerprint / Face unlock. Zipp checks whether your device has a supported biometric enrolled.' },
      { title: 'Enable and verify', body: 'Turn on the switch and complete the device verification prompt. The setting is enabled only after verification succeeds.' },
      { title: 'Try the unlock flow', body: 'Use Test unlock to check the prompt. When you leave Zipp and return, tap Unlock Zipp to verify your identity. Device-passcode fallback is available for unlocking.' },
    ],
    details: [{ title: 'If the option is unavailable', body: 'Read the device message and tap Check again after updating your phone’s settings. Some devices offer face recognition that does not meet the strong-biometric requirement. On iOS, Face ID requires a development build and cannot be tested in Expo Go.' }, { title: 'Device unlock and passkeys', body: 'This feature locks the current app session. It is not account passkey sign-in, which is not available yet. The unlock setting currently lasts for the app session.' }],
    tip: { title: 'Turning unlock off', body: 'Return to the same screen and switch it off. Zipp asks you to verify your identity before disabling the protection.' },
    related: ['account'],
  },
  {
    id: 'sounds', title: 'Can I change my notification sounds?', category: 'Notifications', icon: 'musical-notes-outline',
    answer: 'Yes. Choose a separate sound for each type of in-app notification, including driver arrival, ride start, cancellation, payment alerts, receipts, wallet deposits, and announcements.',
    steps: [
      { title: 'Open Notifications', body: 'Go to Profile, then Notifications. At the top, choose which categories of in-app banners you want to see.' },
      { title: 'Choose an individual alert', body: 'Under Notification sounds, tap the alert you want to customize. Each alert has its own selection, so changing one does not change the others.' },
      { title: 'Preview and select a tone', body: 'Choose Chime, Bell, or Pulse. Tap the play icon to preview a tone. Choose Silent if you want that alert without a sound.' },
      { title: 'Return when you are done', body: 'Your selection applies immediately; there is no separate save button. Return to Notifications to review the selected tone beside each alert.' },
    ],
    details: [{ title: 'If you cannot hear the preview', body: 'Check your phone’s media volume and silent mode. Sound previews and alerts respect those settings. If a preview fails, try playing it again.' }, { title: 'Muted categories and history', body: 'Turning off a category stops new in-app banners for that category. Updates still appear in notification history. Choosing Silent changes the tone only; it does not turn off the banner.' }],
    tip: { title: 'In-app alerts', body: 'These selections apply while using Zipp, not to operating-system push notification channels. Sound and category choices currently last for the app session.' },
    related: ['wallet', 'account'],
  },
  {
    id: 'language', title: 'How do I change the app language?', category: 'Your account', icon: 'language-outline',
    answer: 'You can choose English or French from Profile. The selected language is shown beside the Language option.',
    steps: [
      { title: 'Open Language', body: 'Tap Profile in the main navigation bar, then choose Language under Account.' },
      { title: 'Make your selection', body: 'Tap English or Français. A checkmark shows the selected language, and the setting applies immediately.' },
      { title: 'Return to the app', body: 'Go back to Profile and continue using Zipp. Screens with available translations use the language you selected.' },
    ],
    details: [{ title: 'About translated screens', body: 'Your selected language applies to app navigation, labels, and translated screen content. Names, messages, and addresses stay as entered.' }, { title: 'When reopening the app', body: 'Zipp remembers your language on this device, including after you close the app or log out. Your device language is used only before you make a selection.' }],
    tip: { title: 'No extra save step', body: 'The checkmark confirms your selection. You can return and change it again whenever you need.' },
    related: ['account', 'sounds'],
  },
];

export function faqSearchText(item: FAQItem) {
  return [item.title, item.category, item.answer, ...item.steps.flatMap(step => [step.title, step.body]), ...item.details.flatMap(detail => [detail.title, detail.body]), item.tip.title, item.tip.body].join(' ');
}

export function validateProfile(name: string, email: string, phone: string) {
  if (!name.trim()) return 'Enter your name.';
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (!/^\+?[\d\s()-]{9,18}$/.test(phone.trim())) return 'Enter a valid phone number.';
  return '';
}
export function validatePassword(current: string, next: string, confirm: string) {
  if (!current) return 'Enter your current password.';
  if (next.length < 8) return 'Use at least 8 characters for your new password.';
  if (next === current) return 'Choose a different password.';
  if (next !== confirm) return 'Your new passwords do not match.';
  return '';
}
export function validateSupport(subject: string, email: string, message: string) {
  if (!subject.trim()) return 'Choose a topic.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (message.trim().length < 10) return 'Tell us a little more (at least 10 characters).';
  return '';
}
