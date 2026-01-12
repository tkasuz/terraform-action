terraform {
  required_version = ">= 1.0"
}

# Example provider
provider "random" {}

# Example resource
resource "random_pet" "example" {
  length    = 5
  separator = "-"
}

# Example output
output "pet_name" {
  value       = random_pet.example.id
  description = "The generated pet name for prod"
}
