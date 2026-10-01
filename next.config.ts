import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sol alt köşede beliren Next.js geliştirme rozeti ("N" logosu) kapatıldı.
  // Bu rozet uygulamanın parçası değildir; yalnızca `next dev` sırasında görünür ve
  // sidebar'ın üzerine bindiği için karışıklık yaratıyordu. Production'da zaten çıkmaz.
  devIndicators: false,
};

export default nextConfig;
