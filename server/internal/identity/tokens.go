package identity

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Claims struct {
	Subject string `json:"sub"`
	Email   string `json:"email"`
	Exp     int64  `json:"exp"`
}

func NewAccessToken(user User, secret string, ttl time.Duration, now time.Time) (string, error) {
	claims := Claims{Subject: user.ID, Email: user.Email, Exp: now.Add(ttl).Unix()}
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	h, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	c, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	unsigned := b64(h) + "." + b64(c)
	return unsigned + "." + sign(unsigned, secret), nil
}

func ParseAccessToken(token, secret string, now time.Time) (Claims, error) {
	var claims Claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return claims, ErrUnauthorized
	}
	unsigned := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(sign(unsigned, secret))) {
		return claims, ErrUnauthorized
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims, ErrUnauthorized
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return claims, ErrUnauthorized
	}
	if claims.Subject == "" || now.Unix() >= claims.Exp {
		return claims, ErrUnauthorized
	}
	return claims, nil
}

func NewRefreshToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func HashRefreshToken(token, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(token))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func b64(value []byte) string {
	return base64.RawURLEncoding.EncodeToString(value)
}

func sign(unsigned, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(unsigned))
	return b64(mac.Sum(nil))
}

func requireSecret(value string) error {
	if len(value) < 32 {
		return errors.New("secret must be at least 32 characters")
	}
	return nil
}
