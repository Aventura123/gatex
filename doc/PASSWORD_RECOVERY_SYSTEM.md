# Sistema de Recuperação de Password - GateX

## Visão Geral

O sistema GateX usa emails internos (`admin.username@gate33.internal`) que não permitem recuperação de password via Firebase Auth padrão. Por isso, implementamos um sistema próprio de recuperação de password.

## Funcionalidades Implementadas

### 1. Reset de Password (Auto-serviço)
**Endpoint:** `POST /api/admin/reset-password`

Permite que um admin altere sua própria password fornecendo:
- Username atual
- Password atual (para verificação)
- Nova password

```json
{
  "username": "aventura77",
  "currentPassword": "password_atual",
  "newPassword": "nova_password_segura"
}
```

### 2. Geração de Password Temporária (Super Admin)
**Endpoint:** `POST /api/admin/generate-temp-password`

Permite que super admins gerem passwords temporárias para outros admins:
- Apenas super admins podem usar
- Gera password temporária aleatória
- Força o admin a alterar password no próximo login

```json
{
  "username": "admin_esqueceu_password",
  "requesterUid": "uid_do_super_admin"
}
```

### 3. Verificação de Password Temporária
O sistema de login verifica se o admin precisa alterar a password e retorna a flag `requiresPasswordChange`.

## Fluxo de Recuperação

### Cenário 1: Admin lembra da password atual
1. Admin acessa formulário de alteração de password
2. Fornece username, password atual e nova password
3. Sistema valida e atualiza tanto Firestore quanto Firebase Auth

### Cenário 2: Admin esqueceu a password
1. Admin contacta super admin
2. Super admin usa interface/API para gerar password temporária
3. Super admin fornece password temporária ao admin
4. Admin faz login com password temporária
5. Sistema força alteração de password no primeiro login

## Segurança

- Passwords são hash com bcrypt (custo 10)
- Verificação de password atual obrigatória para auto-reset
- Apenas super admins podem gerar passwords temporárias
- Logs detalhados de todas as operações
- Passwords temporárias marcadas com timestamp e quem gerou
- Flag `requiresPasswordChange` força alteração no próximo login

## Arquivos Principais

- `/app/api/admin/reset-password/route.ts` - Reset próprio
- `/app/api/admin/generate-temp-password/route.ts` - Geração temp (super admin)
- `/app/api/admin/login/route.ts` - Verificação de temp password
- `/utils/adminEmailConverter.ts` - Utilitários de conversão e geração

## Integração no Frontend

O sistema está pronto para integração. É necessário:

1. **Formulário de Reset de Password** 
   - Campos: username, currentPassword, newPassword, confirmPassword
   - Validação de confirmação de password
   - Chamada para `/api/admin/reset-password`

2. **Interface Super Admin para Temp Password**
   - Lista de admins
   - Botão "Gerar Password Temporária"
   - Exibição segura da password gerada
   - Chamada para `/api/admin/generate-temp-password`

3. **Detecção de Password Temporária no Login**
   - Verificar `requiresPasswordChange` na resposta do login
   - Redirecionar para formulário de alteração obrigatória
   - Não permitir acesso ao dashboard até alterar password
