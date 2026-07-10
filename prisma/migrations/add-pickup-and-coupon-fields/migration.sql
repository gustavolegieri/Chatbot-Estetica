ALTER TABLE "Client" ADD COLUMN "address" TEXT;
ALTER TABLE "Client" ADD COLUMN "addressLat" DECIMAL(10,7);
ALTER TABLE "Client" ADD COLUMN "addressLng" DECIMAL(10,7);

ALTER TABLE "Appointment" ADD COLUMN "needsPickup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "needsReturn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "pickupAddress" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "pickupDistanceKm" DECIMAL(6,2);
ALTER TABLE "Appointment" ADD COLUMN "pickupFee" DECIMAL(10,2);
ALTER TABLE "Appointment" ADD COLUMN "couponId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "couponDiscount" DECIMAL(10,2);
ALTER TABLE "Appointment" ADD COLUMN "finalPrice" DECIMAL(10,2);

ALTER TABLE "Settings" ADD COLUMN "storeAddress" TEXT NOT NULL DEFAULT 'Rua Professor Benedito Loureiro de Lima, 146, Jardim Esplanada, Jundiaí, SP';
ALTER TABLE "Settings" ADD COLUMN "storeLat" DECIMAL(10,7);
ALTER TABLE "Settings" ADD COLUMN "storeLng" DECIMAL(10,7);
ALTER TABLE "Settings" ADD COLUMN "pickupDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "pickupFeePerKm" DECIMAL(10,2) NOT NULL DEFAULT 2.50;
ALTER TABLE "Settings" ADD COLUMN "pickupFeeBase" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "pickupMaxDistanceKm" INTEGER;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
