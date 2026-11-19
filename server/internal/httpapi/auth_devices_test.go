package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthAndDeviceEndpoints(t *testing.T) {
	app := testServer()

	register := httptest.NewRecorder()
	app.ServeHTTP(register, jsonReq(http.MethodPost, "/api/v1/auth/register", map[string]string{
		"username": "alice",
		"email":    "alice@example.com",
		"password": "correct horse battery",
	}))
	if register.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", register.Code, register.Body.String())
	}
	var auth struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.Unmarshal(register.Body.Bytes(), &auth); err != nil {
		t.Fatal(err)
	}

	me := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(me, req)
	if me.Code != http.StatusOK {
		t.Fatalf("me status=%d body=%s", me.Code, me.Body.String())
	}

	deviceResp := httptest.NewRecorder()
	req = jsonReq(http.MethodPost, "/api/v1/devices/register", map[string]string{
		"deviceName":        "Alice PC",
		"deviceFingerprint": "fp-1",
		"osName":            "Windows 11",
		"appVersion":        "0.2.0",
	})
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(deviceResp, req)
	if deviceResp.Code != http.StatusCreated {
		t.Fatalf("device register status=%d body=%s", deviceResp.Code, deviceResp.Body.String())
	}
	var deviceBody struct {
		Device struct {
			ID string `json:"id"`
		} `json:"device"`
	}
	_ = json.Unmarshal(deviceResp.Body.Bytes(), &deviceBody)

	listResp := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/v1/devices?currentDeviceId="+deviceBody.Device.ID, nil)
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(listResp, req)
	if listResp.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", listResp.Code, listResp.Body.String())
	}

	deleteResp := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/devices/"+deviceBody.Device.ID, nil)
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(deleteResp, req)
	if deleteResp.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", deleteResp.Code, deleteResp.Body.String())
	}
}

func TestDeviceAssistRequestEndpoint(t *testing.T) {
	app := testServer()
	auth := registerTestUser(t, app)
	host := registerTestDevice(t, app, auth.AccessToken, "Host PC", "host-fp")
	controller := registerTestDevice(t, app, auth.AccessToken, "Controller PC", "controller-fp")

	req := jsonReq(http.MethodPost, "/api/v1/devices/"+host+"/assist", map[string]string{"controllerDeviceId": controller})
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, req)
	if resp.Code != http.StatusCreated {
		t.Fatalf("assist request status=%d body=%s", resp.Code, resp.Body.String())
	}
	var created struct {
		Request struct {
			ID string `json:"id"`
		} `json:"request"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/devices/"+host+"/assist-requests", nil)
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	resp = httptest.NewRecorder()
	app.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("assist list status=%d body=%s", resp.Code, resp.Body.String())
	}

	unauthorized := httptest.NewRecorder()
	app.ServeHTTP(unauthorized, jsonReq(http.MethodPost, "/api/v1/assist-requests/"+created.Request.ID+"/resolve", map[string]string{"status": "ACCEPTED"}))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized resolve status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}

	resolve := func() *httptest.ResponseRecorder {
		request := jsonReq(http.MethodPost, "/api/v1/assist-requests/"+created.Request.ID+"/resolve", map[string]string{"status": "ACCEPTED"})
		request.Header.Set("Authorization", "Bearer "+auth.AccessToken)
		result := httptest.NewRecorder()
		app.ServeHTTP(result, request)
		return result
	}
	if result := resolve(); result.Code != http.StatusOK {
		t.Fatalf("assist resolve status=%d body=%s", result.Code, result.Body.String())
	}
	if result := resolve(); result.Code != http.StatusConflict {
		t.Fatalf("repeat assist resolve status=%d body=%s", result.Code, result.Body.String())
	}
}

func TestAssistResolveRequiresHostOwnership(t *testing.T) {
	app := testServer()
	owner := registerTestUser(t, app)
	other := registerNamedTestUser(t, app, "carol", "carol@example.com")
	host := registerTestDevice(t, app, owner.AccessToken, "Host PC", "owned-host")
	controller := registerTestDevice(t, app, owner.AccessToken, "Controller PC", "owned-controller")
	create := jsonReq(http.MethodPost, "/api/v1/devices/"+host+"/assist", map[string]string{"controllerDeviceId": controller})
	create.Header.Set("Authorization", "Bearer "+owner.AccessToken)
	created := httptest.NewRecorder()
	app.ServeHTTP(created, create)
	var body struct {
		Request struct {
			ID string `json:"id"`
		} `json:"request"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}

	resolve := jsonReq(http.MethodPost, "/api/v1/assist-requests/"+body.Request.ID+"/resolve", map[string]string{"status": "ACCEPTED"})
	resolve.Header.Set("Authorization", "Bearer "+other.AccessToken)
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, resolve)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("non-owner resolve status=%d body=%s", resp.Code, resp.Body.String())
	}
}

func registerTestUser(t *testing.T, app http.Handler) struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
} {
	return registerNamedTestUser(t, app, "bob", "bob@example.com")
}

func registerNamedTestUser(t *testing.T, app http.Handler, username, email string) struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
} {
	t.Helper()
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, jsonReq(http.MethodPost, "/api/v1/auth/register", map[string]string{
		"username": username,
		"email":    email,
		"password": "correct horse battery",
	}))
	if resp.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", resp.Code, resp.Body.String())
	}
	var auth struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
	}
	_ = json.Unmarshal(resp.Body.Bytes(), &auth)
	return auth
}

func registerTestDevice(t *testing.T, app http.Handler, token, name, fp string) string {
	t.Helper()
	req := jsonReq(http.MethodPost, "/api/v1/devices/register", map[string]string{
		"deviceName":        name,
		"deviceFingerprint": fp,
		"osName":            "Windows 11",
		"appVersion":        "0.2.0",
	})
	req.Header.Set("Authorization", "Bearer "+token)
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, req)
	if resp.Code != http.StatusCreated {
		t.Fatalf("device register status=%d body=%s", resp.Code, resp.Body.String())
	}
	var body struct {
		Device struct {
			ID string `json:"id"`
		} `json:"device"`
	}
	_ = json.Unmarshal(resp.Body.Bytes(), &body)
	return body.Device.ID
}
