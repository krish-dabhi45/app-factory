/// App ke andar static rehne wale counters (online nahi aate).
/// Har screen-group ka apna flag ho sakta hai, home ke liye `homeFlag`.
class AdFlags {
  AdFlags._();

  static int homeFlag = 0;

  /// User premium hai to koi ad nahi. Purchase/restore ke baad set karo.
  static bool isPremium = false;

  /// Koi full screen ad (interstitial / app open) abhi screen par hai?
  /// App open on-resume ko double show hone se rokta hai.
  static bool isFullScreenAdShowing = false;

  /// Consent mila aur MobileAds initialize ho gaya (AdsConsent.init). Tab tak koi ad request nahi.
  static bool adsReady = false;
}
