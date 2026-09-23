import { describe, expect, it } from "vitest";
import { mentionsPrice } from "@/server/cuttings/types";
import { createCuttingListingSchema, setPseudoSchema, recordCuttingTransactionSchema } from "@/server/validation/cutting";

const validListing = {
  title: "Bouture de menthe",
  type: "DON" as const,
  photoUrls: ["/uploads/x.jpg"],
  noSaleAccepted: true as const,
};

describe("mentionsPrice (garde-fou anti-vente sur le texte d'une annonce)", () => {
  it.each(["5€", "5 €", "10 euros", "2 EUR", "prix à discuter", "je vends 3 boutures", "à vendre", "a vendre", "€ 5", "tarif : 3 euros", "boutures payantes"])(
    "detecte : %s",
    (text) => {
      expect(mentionsPrice(text)).toBe(true);
    },
  );

  it.each([
    "Bouture de menthe enracinée",
    "Pot de 20 cm, à récupérer chez moi",
    "Échange contre une bouture de pothos",
    "3 boutures disponibles",
    "Bouture d'Eurya japonica",
    "Cadeau, gratuit",
  ])("laisse passer : %s", (text) => {
    expect(mentionsPrice(text)).toBe(false);
  });
});

describe("createCuttingListingSchema", () => {
  it("accepte une annonce valide et met la quantite a 1 par defaut", () => {
    const parsed = createCuttingListingSchema.parse(validListing);
    expect(parsed.quantity).toBe(1);
  });

  it("refuse sans engagement de non-vente", () => {
    expect(createCuttingListingSchema.safeParse({ ...validListing, noSaleAccepted: false }).success).toBe(false);
    const { noSaleAccepted: _omitted, ...withoutCommitment } = validListing;
    void _omitted;
    expect(createCuttingListingSchema.safeParse(withoutCommitment).success).toBe(false);
  });

  it("refuse un prix dans le titre ou la description", () => {
    expect(createCuttingListingSchema.safeParse({ ...validListing, title: "Menthe 5€" }).success).toBe(false);
    expect(createCuttingListingSchema.safeParse({ ...validListing, description: "Je vends ces boutures" }).success).toBe(false);
  });

  it("refuse 0 photo et une quantite hors bornes", () => {
    expect(createCuttingListingSchema.safeParse({ ...validListing, photoUrls: [] }).success).toBe(false);
    expect(createCuttingListingSchema.safeParse({ ...validListing, quantity: 0 }).success).toBe(false);
    expect(createCuttingListingSchema.safeParse({ ...validListing, quantity: 100 }).success).toBe(false);
    expect(createCuttingListingSchema.safeParse({ ...validListing, quantity: 5 }).success).toBe(true);
  });
});

describe("autres schemas", () => {
  it("setPseudoSchema : longueur et caracteres", () => {
    expect(setPseudoSchema.safeParse({ pseudo: "Léa du balcon" }).success).toBe(true);
    expect(setPseudoSchema.safeParse({ pseudo: "ab" }).success).toBe(false);
    expect(setPseudoSchema.safeParse({ pseudo: "x".repeat(25) }).success).toBe(false);
    expect(setPseudoSchema.safeParse({ pseudo: "<script>" }).success).toBe(false);
  });

  it("recordCuttingTransactionSchema : quantite entiere positive", () => {
    expect(recordCuttingTransactionSchema.safeParse({ recipientId: "u", quantity: 3 }).success).toBe(true);
    expect(recordCuttingTransactionSchema.safeParse({ recipientId: "u", quantity: 0 }).success).toBe(false);
    expect(recordCuttingTransactionSchema.safeParse({ recipientId: "u", quantity: 1.5 }).success).toBe(false);
  });
});
