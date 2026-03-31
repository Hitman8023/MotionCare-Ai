import emailjs from "@emailjs/browser";

const SERVICE_ID = "service_b05a8vb";
const TEMPLATE_ID = "template_8tdm4nv";
const PUBLIC_KEY = "yZPzoLYMfjTM4hJox";

export const sendWelcomeEmail = async (name: string, email: string) => {
  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        signupName: name,
        signupEmail: email,
      },
      PUBLIC_KEY
    );

    console.log("✅ Welcome email sent");
    return true;
  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
};