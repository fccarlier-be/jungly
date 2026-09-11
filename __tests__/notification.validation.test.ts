import { describe, expect, it } from "vitest";
import { pushSubscriptionSchema } from "@/server/validation/notification";

function input(endpoint: string) {
  return { endpoint, keys: { p256dh: "x", auth: "y" } };
}

/**
 * SSRF Web Push (audit13.md) : sendPushToUser() fait une vraie requete HTTP
 * vers `endpoint` a chaque notification -- ces tests verifient que seuls les
 * services de push reels sont acceptes, pas une URL arbitraire (reseau
 * interne, IP privee, hote fantaisiste).
 */
describe("pushSubscriptionSchema -- liste blanche des services de push (SSRF)", () => {
  it("accepte un endpoint FCM (Chrome/Edge/Android) reel", () => {
    expect(pushSubscriptionSchema.safeParse(input("https://fcm.googleapis.com/fcm/send/abc123")).success).toBe(true);
  });

  it("accepte un endpoint Mozilla (Firefox) reel", () => {
    expect(
      pushSubscriptionSchema.safeParse(input("https://updates.push.services.mozilla.com/wpush/v2/abc123")).success,
    ).toBe(true);
  });

  it("accepte un endpoint Apple (Safari) reel", () => {
    expect(pushSubscriptionSchema.safeParse(input("https://web.push.apple.com/abc123")).success).toBe(true);
  });

  it("rejette une IP privee/loopback", () => {
    expect(pushSubscriptionSchema.safeParse(input("http://127.0.0.1:3000/")).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(input("http://192.168.1.1/")).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(input("http://10.0.0.5:8080/")).success).toBe(false);
  });

  it("rejette un hote Docker interne du meme reseau", () => {
    expect(pushSubscriptionSchema.safeParse(input("http://plantes-app:3000/")).success).toBe(false);
  });

  it("rejette un hote arbitraire ressemblant a un vrai service (sous-domaine/typosquat)", () => {
    expect(pushSubscriptionSchema.safeParse(input("https://fcm.googleapis.com.evil.example/")).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(input("https://evil.example/fcm.googleapis.com")).success).toBe(false);
  });

  it("rejette une URL malformee", () => {
    expect(pushSubscriptionSchema.safeParse(input("pas-une-url")).success).toBe(false);
  });
});
